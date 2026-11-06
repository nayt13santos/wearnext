import {analyzePhotoColors,type PhotoColors} from './photo-colors';
import {photoSignature,type VisualSignature} from './photo-similarity';
export type PhotoAnalysis={colors:PhotoColors;signature:VisualSignature};
export type PhotoResult={blob:Blob;original:Blob;url:string;color:string;fingerprint:string;analysis?:PhotoAnalysis};
async function openPhoto(file:Blob):Promise<{image:CanvasImageSource;width:number;height:number;close:()=>void}> {
  try{const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});return {image:bitmap,width:bitmap.width,height:bitmap.height,close:()=>bitmap.close()};}catch{
    // Safari can decode some camera images through <img> that ImageBitmap rejects.
    const url=URL.createObjectURL(file),image=new Image();image.src=url;
    try{await image.decode();return {image,width:image.naturalWidth,height:image.naturalHeight,close:()=>URL.revokeObjectURL(url)};}
    catch{URL.revokeObjectURL(url);throw new Error('This photo cannot be opened. Choose JPG, PNG or WebP, or take a new photo.');}
  }
}
function canvasOf(width:number,height:number){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('Photo processing is unavailable.');return {canvas,context};}
function jpeg(canvas:HTMLCanvasElement,quality:number){return new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Photo conversion failed.')),'image/jpeg',quality));}
function analyzeCanvas(canvas:HTMLCanvasElement):PhotoAnalysis {
  const scale=Math.min(1,160/Math.max(canvas.width,canvas.height));
  const {canvas:small,context}=canvasOf(Math.max(1,Math.round(canvas.width*scale)),Math.max(1,Math.round(canvas.height*scale)));
  context.drawImage(canvas,0,0,small.width,small.height);
  const data=context.getImageData(0,0,small.width,small.height),colors=analyzePhotoColors(data.data,small.width,small.height);
  const bounds=colors.foreground?colors.bounds:{x:0,y:0,width:small.width,height:small.height};
  const region=context.getImageData(bounds.x,bounds.y,bounds.width,bounds.height);
  return {colors,signature:photoSignature(region.data,bounds.width,bounds.height)};
}
export async function analyzePhoto(file:Blob):Promise<PhotoAnalysis>{
  const source=await openPhoto(file);
  try{const scale=Math.min(1,640/Math.max(source.width,source.height));const {canvas,context}=canvasOf(Math.max(1,Math.round(source.width*scale)),Math.max(1,Math.round(source.height*scale)));context.drawImage(source.image,0,0,canvas.width,canvas.height);return analyzeCanvas(canvas);}finally{source.close();}
}
export async function processPhoto(file:Blob,{clean=false,rotation=0,zoom=1}:{clean?:boolean;rotation?:number;zoom?:number}={}):Promise<PhotoResult>{
  if(file.size>20*1024*1024)throw new Error('Choose a photo under 20 MB.');
  const source=await openPhoto(file),scale=Math.min(1,1200/Math.max(source.width,source.height));
  const w=Math.max(1,Math.round(source.width*scale)),h=Math.max(1,Math.round(source.height*scale));
  const {canvas,context:ctx}=canvasOf(rotation%180?h:w,rotation%180?w:h);
  try{ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(rotation*Math.PI/180);ctx.drawImage(source.image,-w/2,-h/2,w,h);}finally{source.close();}
  ctx.setTransform(1,0,0,1,0,0);
  const analysis=analyzeCanvas(canvas);
  const originalCanvas=canvasOf(canvas.width,canvas.height);originalCanvas.context.fillStyle='white';originalCanvas.context.fillRect(0,0,canvas.width,canvas.height);originalCanvas.context.drawImage(canvas,0,0);
  const original=await jpeg(originalCanvas.canvas,.88);
  if(clean){
    const data=ctx.getImageData(0,0,canvas.width,canvas.height),d=data.data,W=canvas.width,H=canvas.height;
    const corner=[0,(W-1)*4,W*(H-1)*4,(W*H-1)*4],bg=[0,1,2].map(c=>corner.reduce((s,i)=>s+d[i+c],0)/4);
    const visited=new Uint8Array(W*H),queue=new Int32Array(W*H);let tail=0,head=0;
    const push=(i:number)=>{if(i>=0&&i<W*H&&!visited[i]){visited[i]=1;if(Math.hypot(d[i*4]-bg[0],d[i*4+1]-bg[1],d[i*4+2]-bg[2])<38)queue[tail++]=i;}};
    for(let x=0;x<W;x++){push(x);push((H-1)*W+x);}for(let y=0;y<H;y++){push(y*W);push(y*W+W-1);}
    while(head<tail){const i=queue[head++];d[i*4+3]=0;if(i%W)push(i-1);if(i%W<W-1)push(i+1);push(i-W);push(i+W);}ctx.putImageData(data,0,0);
  }
  const {canvas:out,context:o}=canvasOf(900,900);o.fillStyle='white';o.fillRect(0,0,900,900);const fit=Math.min(800/canvas.width,800/canvas.height)*zoom;
  o.drawImage(canvas,(900-canvas.width*fit)/2,(900-canvas.height*fit)/2,canvas.width*fit,canvas.height*fit);
  const blob=await jpeg(out,.9);
  const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await original.arrayBuffer()))).map(b=>b.toString(16).padStart(2,'0')).join('');
  return {blob,original,url:URL.createObjectURL(blob),color:analysis.colors.color||'Grey',fingerprint,analysis};
}
