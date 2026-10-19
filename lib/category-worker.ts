import {env,InferenceSession,Tensor} from 'onnxruntime-web/wasm';
import wasm from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import mjs from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
import labels from '../public/models/clip-clothing/labels.json';
import {suggestCategory} from './category-rules';

env.wasm.numThreads=1;
env.wasm.wasmPaths={wasm,mjs};
let model:Promise<InferenceSession>|undefined;
async function modelBytes(){
 const url=new URL(import.meta.env.BASE_URL+'models/clip-clothing/category.onnx',self.location.origin).href;
 // Cache only public model weights. Wardrobe photos never enter this cache.
 let cache:Cache|undefined;
 try{cache=await caches.open('wearnext-category-v1');const saved=await cache.match(url);if(saved)return saved.arrayBuffer();}catch{/* Private browsing may disable storage. */}
 const response=await fetch(url);if(!response.ok)throw Error('Model unavailable');
 const bytes=await response.arrayBuffer();
 try{await cache?.put(url,new Response(bytes,{headers:{'Content-Type':'application/octet-stream'}}));}catch{/* Recognition works without persistent caching. */}
 return bytes;
}
function getModel(){
 if(!model)model=modelBytes().then(bytes=>InferenceSession.create(bytes,{executionProviders:['wasm'],graphOptimizationLevel:'all'})).catch(error=>{model=undefined;throw error;});
 return model;
}
let queue=Promise.resolve();
self.onmessage=(event:MessageEvent<{id:number;pixels:Uint8ClampedArray;width:number;height:number}>)=>{
 const {id,pixels,width,height}=event.data;
 queue=queue.then(async()=>{
  try{
   self.postMessage({id,status:'loading'});const network=await getModel();
   self.postMessage({id,status:'recognizing'});
   const size=width*height,data=new Float32Array(size*3);
   const mean=[.48145466,.4578275,.40821073],std=[.26862954,.26130258,.27577711];
   for(let i=0;i<size;i++)for(let c=0;c<3;c++)data[c*size+i]=(pixels[i*4+c]/255-mean[c])/std[c];
   const input=new Tensor('float32',data,[1,3,height,width]);
   try{
    const output=await network.run({pixels:input});
    try{self.postMessage({id,result:suggestCategory(output.similarities.data as Float32Array,labels)});}
    finally{Object.values(output).forEach(tensor=>tensor.dispose());}
   }finally{input.dispose();}
  }catch{self.postMessage({id,error:'Category detection is unavailable. Choose the category below.'});}
 });
};
