export type VisualSignature={pixels:number[];hash:string;contrast:number;aspect:number};
export function photoSignature(pixels:Uint8ClampedArray,width:number,height:number):VisualSignature {
  const samples:number[]=[],grey:number[]=[],size=16;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=(Math.min(height-1,Math.floor((y+.5)*height/size))*width+Math.min(width-1,Math.floor((x+.5)*width/size)))*4;
    const rgb=[pixels[i],pixels[i+1],pixels[i+2]].map(v=>Number.isFinite(v)?v:255);
    samples.push(...rgb.map(v=>v/255));grey.push(rgb[0]*.299+rgb[1]*.587+rgb[2]*.114);
  }
  const mean=grey.reduce((a,b)=>a+b,0)/grey.length;
  const contrast=Math.sqrt(grey.reduce((s,v)=>s+(v-mean)**2,0)/grey.length);
  let hash='';for(let y=0;y<size;y++)for(let x=0;x<size-1;x++)hash+=grey[y*size+x]>grey[y*size+x+1]?'1':'0';
  return {pixels:samples,hash,contrast,aspect:width/height};
}
export function similarPhoto(a:VisualSignature,b:VisualSignature):boolean {
  if(a.pixels.length!==768||b.pixels.length!==768||a.hash.length!==240||b.hash.length!==240)return false;
  if(!Number.isFinite(a.aspect)||!Number.isFinite(b.aspect)||Math.abs(Math.log(a.aspect/b.aspect))>.20)return false;
  // Flat color alone is never evidence that two separate garments are identical.
  if(Math.min(a.contrast,b.contrast)<12)return false;
  // Reject a systematic color shift even when a large neutral background agrees.
  for(let c=0;c<3;c++){let shift=0;for(let i=c;i<a.pixels.length;i+=3)shift+=a.pixels[i]-b.pixels[i];if(Math.abs(shift)/256>.065)return false;}
  const difference=a.pixels.reduce((sum,v,i)=>sum+Math.abs(v-b.pixels[i]),0)/a.pixels.length;
  let bits=0;for(let i=0;i<a.hash.length;i++)if(a.hash[i]!==b.hash[i])bits++;
  return difference<.075&&bits/a.hash.length<.18;
}
