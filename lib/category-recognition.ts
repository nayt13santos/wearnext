import type {CategorySuggestion} from './category-rules';
export type RecognitionOptions={signal?:AbortSignal;onProgress?:(message:string)=>void};
type Pending={resolve:(result:CategorySuggestion)=>void;reject:(error:Error)=>void;progress?:(message:string)=>void;cleanup:()=>void};
let worker:Worker|undefined,nextId=0;
const pending=new Map<number,Pending>();
function reset(){worker?.terminate();worker=undefined;for(const request of pending.values()){request.cleanup();request.reject(new Error('Category detection is unavailable. Choose the category manually.'));}pending.clear();}
function getWorker(){
 if(worker)return worker;
 worker=new Worker(new URL('./category-worker.ts',import.meta.url),{type:'module'});
 worker.onerror=reset;
 worker.onmessage=event=>{
  const {id,result,error,status}=event.data,request=pending.get(id);if(!request)return;
  if(status){request.progress?.(status==='loading'?'Preparing category detection…':'Recognizing clothing…');return;}
  pending.delete(id);request.cleanup();if(error)request.reject(new Error(error));else request.resolve(result);
 };
 return worker;
}
export async function recognizeCategory(photo:Blob,options:RecognitionOptions={}):Promise<CategorySuggestion>{
 options.signal?.throwIfAborted();
 const bitmap=await createImageBitmap(photo);
 let pixels:ImageData;
 try{
  const canvas=document.createElement('canvas');canvas.width=224;canvas.height=224;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Image processing is unavailable.');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,224,224);
  const fit=Math.min(224/bitmap.width,224/bitmap.height),w=bitmap.width*fit,h=bitmap.height*fit;
  ctx.drawImage(bitmap,(224-w)/2,(224-h)/2,w,h);pixels=ctx.getImageData(0,0,224,224);
 }finally{bitmap.close();}
 options.signal?.throwIfAborted();
 return new Promise((resolve,reject)=>{
  const id=++nextId;let timer:ReturnType<typeof setTimeout>;
  const abort=()=>{pending.delete(id);cleanup();reject(new DOMException('Cancelled','AbortError'));};
  const cleanup=()=>{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);};
  try{
   const active=getWorker();timer=setTimeout(reset,240000);
   pending.set(id,{resolve,reject,cleanup,progress:options.onProgress});options.signal?.addEventListener('abort',abort,{once:true});
   active.postMessage({id,pixels:pixels.data,width:224,height:224},[pixels.data.buffer]);
  }catch(error){pending.delete(id);cleanup();reject(error);}
 });
}
