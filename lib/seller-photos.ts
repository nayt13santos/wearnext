import {apiRequest} from './connection';

export type SellerMatch={id:string;title:string;source:string;pageUrl:string;thumbnail:string;width:number;height:number};
export type SearchStatus={configured:boolean;used:number;limit:number};
export type SellerSource={label:string;url:string};

export async function searchImageData(photo:Blob):Promise<string>{
  const bitmap=await createImageBitmap(photo);
  const canvas=document.createElement('canvas');
  const scale=Math.min(1,800/Math.max(bitmap.width,bitmap.height));
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const context=canvas.getContext('2d')!;context.fillStyle='white';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  for(const quality of [.8,.6,.4]){
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Could not prepare the search photo.')),'image/jpeg',quality));
    if(blob.size<=480000)return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('Could not read the search photo.'));reader.readAsDataURL(blob);});
  }
  throw new Error('Try a smaller photo for search.');
}
export async function findSellerPhotos(photo:Blob,signal?:AbortSignal){
  const image=await searchImageData(photo);
  if(signal?.aborted)throw new DOMException('Search cancelled','AbortError');
  return apiRequest<{matches:SellerMatch[];status:SearchStatus}>('sellerSearch',{image},undefined,signal);
}
export async function downloadSellerPhoto(id:string,signal?:AbortSignal){
  const result=await apiRequest<{data:string;mime:string;source:SellerSource}>('sellerImage',{id},undefined,signal);
  const binary=atob(result.data),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return {blob:new Blob([bytes],{type:result.mime}),source:result.source};
}
