import {suggestPhotoColor} from './photo-colors';
export type PhotoResult={blob:Blob;original:Blob;url:string;color:string;fingerprint:string};
export async function processPhoto(file:Blob,{clean=false,rotation=0,zoom=1}:{clean?:boolean;rotation?:number;zoom?:number}={}):Promise<PhotoResult>{
 if(file.size>20*1024*1024)throw new Error('Choose a photo under 20 MB.');
 let bitmap:ImageBitmap;try{bitmap=await createImageBitmap(file);}catch{throw new Error('This photo cannot be opened. Use JPG, PNG or WebP; export HEIC as JPG first.');}
 const canvas=document.createElement('canvas');const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height));const w=Math.round(bitmap.width*scale),h=Math.round(bitmap.height*scale);canvas.width=rotation%180?h:w;canvas.height=rotation%180?w:h;
 const ctx=canvas.getContext('2d')!;ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(rotation*Math.PI/180);ctx.drawImage(bitmap,-w/2,-h/2,w,h);bitmap.close();ctx.setTransform(1,0,0,1,0,0);
 const original=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Photo conversion failed.')),'image/jpeg',.88));
 const data=ctx.getImageData(0,0,canvas.width,canvas.height);const d=data.data;const W=canvas.width,H=canvas.height;
 const corner=[0,(W-1)*4,(W*(H-1))*4,(W*H-1)*4];const bg=[0,1,2].map(c=>corner.reduce((s,i)=>s+d[i+c],0)/4);
 const match=(i:number)=>Math.hypot(d[i*4]-bg[0],d[i*4+1]-bg[1],d[i*4+2]-bg[2])<38;
 if(clean){const visited=new Uint8Array(W*H),queue=new Int32Array(W*H);let tail=0,head=0;const push=(i:number)=>{if(i>=0&&i<W*H&&!visited[i]){visited[i]=1;if(match(i))queue[tail++]=i;}};
 for(let x=0;x<W;x++){push(x);push((H-1)*W+x);}for(let y=0;y<H;y++){push(y*W);push(y*W+W-1);}
 while(head<tail){const i=queue[head++];d[i*4+3]=0;if(i%W)push(i-1);if(i%W<W-1)push(i+1);push(i-W);push(i+W);}
 ctx.putImageData(data,0,0);
 }
 const color=suggestPhotoColor(d,W,H);
 const out=document.createElement('canvas');out.width=900;out.height=900;const o=out.getContext('2d')!;o.fillStyle='white';o.fillRect(0,0,900,900);const fit=Math.min(800/W,800/H)*zoom;o.drawImage(canvas,(900-W*fit)/2,(900-H*fit)/2,W*fit,H*fit);
 const blob=await new Promise<Blob>((resolve,reject)=>out.toBlob(b=>b?resolve(b):reject(new Error('Photo processing failed.')),'image/jpeg',.9));
 const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await original.arrayBuffer()))).map(b=>b.toString(16).padStart(2,'0')).join('');
 return {blob,original,url:URL.createObjectURL(blob),color,fingerprint};
}
