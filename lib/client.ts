import {apiRequest} from './connection';
import type {Piece,Preferences,Wear} from './wardrobe';
export type State={pieces:Piece[];wears:Wear[];preferences:Preferences};
const uploadIds=new WeakMap<Blob,string>();
async function toBase64(file:Blob){if(file.size>3*1024*1024)throw new Error('The processed photo is too large. Try a smaller photo.');return new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('Photo could not be read.'));reader.readAsDataURL(file);});}
export async function jsonRequest<T=State>(url:string,options?:RequestInit):Promise<T>{
  if(url.startsWith('/api/weather'))return weatherRequest(new URL(url,'https://wearnext.local').searchParams,options?.signal||undefined) as Promise<T>;
  if(url==='/api/upload'){
    const form=options?.body as FormData,photo=form.get('photo') as Blob,original=form.get('original') as Blob;
    // FormData wraps Blobs in Files. The stable operation id is supplied by the caller.
    const id=String(form.get('id')||crypto.randomUUID());
    return apiRequest<T>('upload',{id,data:JSON.parse(String(form.get('data'))),photo:await toBase64(photo),original:await toBase64(original)});
  }
  if(url!=='/api/wardrobe')throw new Error('Unknown app request.');
  if(!options?.body)return apiRequest<T>('state');
  const {action,...payload}=JSON.parse(String(options.body));
  return apiRequest<T>(action,{...payload,requestId:crypto.randomUUID()});
}
export function uploadId(blob:Blob){let id=uploadIds.get(blob);if(!id){id=crypto.randomUUID();uploadIds.set(blob,id);}return id;}
async function fetchJSON(url:string,signal?:AbortSignal){const response=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(12000)]):AbortSignal.timeout(12000)});if(!response.ok)throw new Error('Weather unavailable. Set the temperature manually.');return response.json();}
async function weatherRequest(q:URLSearchParams,signal?:AbortSignal){
  const city=q.get('city');
  if(city){if(city.length<2||city.length>100)throw new Error('Enter a city name.');const d=await fetchJSON('https://geocoding-api.open-meteo.com/v1/search?name='+encodeURIComponent(city)+'&count=5&language=en&format=json',signal);return {results:d.results||[]};}
  const lat=Number(q.get('lat')),lon=Number(q.get('lon')),day=q.get('day');
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)throw new Error('Check the weather city.');
  const d=await fetchJSON(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=apparent_temperature_max,precipitation_probability_max&timezone=Asia%2FManila&forecast_days=10`,signal);
  const i=d.daily?.time.indexOf(day);if(i===undefined||i<0||!Number.isFinite(d.daily.apparent_temperature_max[i]))throw new Error('Forecast unavailable for this date.');
  const probability=d.daily.precipitation_probability_max[i]||0;return {temperature:Math.round(d.daily.apparent_temperature_max[i]),rain:probability>=45,probability};
}
// In-memory only: keys and private photo data never enter the service-worker cache.
const photos=new Map<string,Promise<string>>();
let photoActive=0;const photoQueue:(()=>void)[]=[];
async function slot(){if(photoActive>=3)await new Promise<void>(resolve=>photoQueue.push(resolve));photoActive++;}
function release(){photoActive--;photoQueue.shift()?.();}
export function photoSource(id:string){
  let promise=photos.get(id);if(!promise){promise=(async()=>{await slot();try{const d=await apiRequest<{data:string;mime:string}>('photo',{id});if(d.mime!=='image/jpeg')throw new Error('Photo type is not supported.');return 'data:image/jpeg;base64,'+d.data;}finally{release();}})();photos.set(id,promise);promise.catch(()=>photos.delete(id));}
  return promise;
}
