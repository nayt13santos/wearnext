export type PhotoColors = {
  color: string | null;
  confidence: number;
  palette: {color:string;share:number}[];
  foreground: boolean;
  bounds: {x:number;y:number;width:number;height:number};
};

// Hue and chroma distinguish pale/dark garments from grey without matching every
// pixel to a single, arbitrarily lit RGB swatch.
export function pixelColor(r:number,g:number,b:number):string {
  const hi=Math.max(r,g,b),lo=Math.min(r,g,b),delta=hi-lo,s=hi?delta/hi:0;
  if(hi<42)return 'Black';
  if(delta<14||s<.10)return hi>=210?'White':hi<45?'Black':'Grey';
  let h=(hi===r?(g-b)/delta:hi===g?(b-r)/delta+2:(r-g)/delta+4)*60;if(h<0)h+=360;
  if(h>=175&&h<265)return hi<112?'Navy':'Blue';
  if(h>=65&&h<175||h>=48&&h<65&&hi<165)return 'Green';
  if(h>=265&&h<325)return 'Purple';
  if(h>=325||h<15)return hi>170&&(s<.65||g>90)?'Pink':'Red';
  if(h<65){
    if(s<.38&&hi>=155)return 'Beige';
    if(hi<165)return 'Brown';
    return h<40?'Orange':'Yellow';
  }
  return 'Grey';
}

export function analyzePhotoColors(pixels:Uint8ClampedArray,width:number,height:number):PhotoColors {
  const empty:PhotoColors={color:null,confidence:0,palette:[],foreground:false,bounds:{x:0,y:0,width,height}};
  if(!width||!height||pixels.length<width*height*4)return empty;
  const step=Math.max(1,Math.ceil(Math.max(width,height)/160)),w=Math.ceil(width/step),h=Math.ceil(height/step),n=w*h;
  const rgb=new Uint8ClampedArray(n*4),background=new Uint8Array(n),border:number[]=[];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x,source=(Math.min(y*step,height-1)*width+Math.min(x*step,width-1))*4;
    rgb.set(pixels.subarray(source,source+4),i*4);
    if(!x||!y||x===w-1||y===h-1)border.push(i);
  }
  // Estimate the background from the largest border cluster, not averaged corners
  // (which can mix a hanger, wall and garment into a nonexistent color).
  const clusters=new Map<string,{count:number;r:number;g:number;b:number}>();
  for(const i of border){if(rgb[i*4+3]<128)continue;const [r,g,b]=rgb.subarray(i*4,i*4+3),key=[r,g,b].map(v=>Math.round(v/32)).join(':');const c=clusters.get(key)||{count:0,r:0,g:0,b:0};c.count++;c.r+=r;c.g+=g;c.b+=b;clusters.set(key,c);}
  const cluster=[...clusters.values()].sort((a,b)=>b.count-a.count)[0];
  const bg=cluster?[cluster.r/cluster.count,cluster.g/cluster.count,cluster.b/cluster.count]:[255,255,255];
  const distance=(i:number)=>Math.hypot(rgb[i*4]-bg[0],rgb[i*4+1]-bg[1],rgb[i*4+2]-bg[2]);
  const uniform=border.filter(i=>rgb[i*4+3]<128||distance(i)<52).length/Math.max(1,border.length)>.65;
  const queue=new Int32Array(n);let head=0,tail=0;
  const push=(i:number)=>{if(background[i]||rgb[i*4+3]>=128&&(!uniform||distance(i)>46))return;background[i]=1;queue[tail++]=i;};
  border.forEach(push);
  while(head<tail){const i=queue[head++];if(i%w)push(i-1);if(i%w<w-1)push(i+1);if(i>=w)push(i-w);if(i<n-w)push(i+w);}
  let remaining=0,minX=w,minY=h,maxX=0,maxY=0;
  for(let i=0;i<n;i++)if(!background[i]&&rgb[i*4+3]>=128){remaining++;minX=Math.min(minX,i%w);maxX=Math.max(maxX,i%w);minY=Math.min(minY,Math.floor(i/w));maxY=Math.max(maxY,Math.floor(i/w));}
  const foreground=uniform&&tail/n>.08&&remaining/n>.025&&remaining/n<.90;
  if(foreground)empty.bounds={x:minX*step,y:minY*step,width:Math.min(width,(maxX+1)*step)-minX*step,height:Math.min(height,(maxY+1)*step)-minY*step};
  const bins=new Map<string,number>();let total=0,brightness=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x;if(rgb[i*4+3]<128)continue;
    if(foreground?background[i]:x<w*.25||x>=w*.75||y<h*.2||y>=h*.8)continue;
    const color=pixelColor(rgb[i*4],rgb[i*4+1],rgb[i*4+2]);
    bins.set(color,(bins.get(color)||0)+1);total++;brightness+=Math.max(rgb[i*4],rgb[i*4+1],rgb[i*4+2]);
  }
  if(!total)return empty;
  // Shading is not a second garment color. White shoes commonly contain grey
  // shadows; navy folds commonly cross the blue/black boundaries.
  const share=(color:string)=>(bins.get(color)||0)/total;
  const combine=(target:string,others:string[])=>{for(const name of others){bins.set(target,(bins.get(target)||0)+(bins.get(name)||0));bins.delete(name);}};
  if(share('White')>.35&&share('Black')<.12&&share('White')+share('Grey')>.80)combine('White',['Grey']);
  for(const [a,b] of [['Blue','Navy'],['Beige','Brown'],['Red','Pink']]){
    if(share(a)+share(b)>.72){const winner=share(a)>=share(b)?a:b;combine(winner,[winner===a?b:a]);}
  }
  const palette=[...bins].map(([color,count])=>({color,share:count/total})).sort((a,b)=>b.share-a.share);
  const multi=palette.length>1&&palette[0].share<.60&&palette[1].share>.28;
  // Unsegmented flat images can still suggest a color, but never silently repair
  // an existing record from background pixels alone.
  const lowContrast=palette[0].color==='Grey'&&brightness/total>130&&Math.min(...bg)>210;
  const confidence=Math.min(lowContrast?.55:.98,(foreground?.95:.50)*(multi?.85:palette[0].share));
  return {...empty,color:multi?'Multicolor':palette[0].color,confidence,palette,foreground};
}

export function suggestPhotoColor(pixels:Uint8ClampedArray,width:number,height:number):string {
  return analyzePhotoColors(pixels,width,height).color||'Grey';
}
