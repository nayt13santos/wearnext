export type Connection={apiUrl:string;token:string};
const KEY='wearnext.connection.v1';
export function validateConnection(input:Connection):Connection {
  const url=new URL(input.apiUrl.trim());
  if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!/^\/macros\/s\/[\w-]+\/exec$/.test(url.pathname)||url.search||url.hash||url.username||url.password)throw new Error('Use the deployed Google Apps Script link ending in /exec.');
  if(!/^[a-f0-9]{64}$/i.test(input.token.trim()))throw new Error('Copy the complete 64-character connection key from your private Setup sheet.');
  return {apiUrl:url.href,token:input.token.trim()};
}
export function readConnection():Connection|null{try{const value=localStorage.getItem(KEY);return value?validateConnection(JSON.parse(value)):null;}catch{return null;}}
export function saveConnection(value:Connection){localStorage.setItem(KEY,JSON.stringify(validateConnection(value)));}
export function disconnect(){localStorage.removeItem(KEY);}
export async function apiRequest<T>(action:string,payload:Record<string,unknown>={},connection=readConnection(),signal?:AbortSignal):Promise<T>{
  if(!connection)throw new Error('Connect this device to your wardrobe first.');
  const verified=validateConnection(connection);
  let response:Response;
  try {response=await fetch(verified.apiUrl,{method:'POST',redirect:'follow',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',body:JSON.stringify({token:verified.token,action,payload}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(90000)]):AbortSignal.timeout(90000)});}
  catch(e){if(signal?.aborted)throw e;throw new Error('Could not reach your Google storage. Check your connection. If saving timed out, refresh before trying again.');}
  let result:{ok:boolean;data:T;error?:string};
  try{result=await response.json();}catch{throw new Error('Google did not return app data. Check the deployment link and its access setting.');}
  if(!response.ok||!result.ok)throw new Error(result.error||'The request could not be completed.');
  return result.data;
}
