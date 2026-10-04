import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
const source=['Code.gs','SellerPhotos.gs'].map(name=>readFileSync(new URL('../apps-script/'+name,import.meta.url),'utf8')).join('\n');
const key='a'.repeat(64),searchKey='b'.repeat(64),id='00000000-0000-4000-8000-000000000001';
function response(data,code=200){return {getResponseCode:()=>code,getContentText:()=>JSON.stringify(data),getAllHeaders:()=>({}),getBlob:()=>({getBytes:()=>[255,216,255,217]})};}
function fixture(){
  const props={CONNECTION_KEY:key,SERPAPI_KEY:searchKey},cache=new Map(),calls=[];
  let handler=url=>url.startsWith('https://dns.google/')?response({Status:0,Answer:[{type:1,data:'93.184.215.14'}]}):url==='https://serpapi.com/image'?response({image_id:'upload-id'}):response({visual_matches:[{image:'https://shop.test-store.com/photo.jpg',link:'https://shop.test-store.com/item',thumbnail:'https://images.test-store.com/thumb.jpg',title:'Blue shirt',source:'Test store',image_width:1200,image_height:1500}]});
  const context=vm.createContext({console,Date,JSON,PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k],setProperty:(k,v)=>{props[k]=v;},deleteProperty:k=>{delete props[k];}})},CacheService:{getScriptCache:()=>({get:k=>cache.get(k)||null,put:(k,v)=>cache.set(k,v)})},ContentService:{MimeType:{JSON:'application/json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},Utilities:{formatDate:()=> '2026-10',getUuid:()=>id,DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,bytes)=>Array.from(createHash('sha256').update(Buffer.from(bytes)).digest()),base64Decode:s=>Array.from(Buffer.from(s,'base64')),base64Encode:b=>Buffer.from(b).toString('base64'),newBlob:bytes=>bytes},UrlFetchApp:{fetch:(url,options)=>{calls.push({url,options});return handler(url,options);}}});
  vm.runInContext(source,context);
  const request=(action,payload={},token=key)=>context.doPost({postData:{contents:JSON.stringify({action,payload,token})}});
  return {props,cache,calls,context,request,setHandler(fn){handler=fn;}};
}
test('search and configuration endpoints authenticate before contacting any provider',()=>{
  const f=fixture();for(const action of ['sellerSearch','sellerImage','sellerKey','sellerStatus'])assert.equal(f.request(action,{},'').ok,false);assert.equal(f.calls.length,0);
});
test('unconfigured search has a useful fallback and never uploads the photo',()=>{
  const f=fixture();delete f.props.SERPAPI_KEY;assert.equal(f.request('sellerStatus').data.configured,false);
  assert.match(f.request('sellerSearch',{image:'/9j/2Q=='}).error,/Preferences/);assert.equal(f.calls.length,0);
});
test('private image upload returns selectable source links, uses a cache, and consumes one attempt',()=>{
  const f=fixture(),first=f.request('sellerSearch',{image:'/9j/2Q=='});assert.equal(first.ok,true);assert.equal(first.data.matches[0].pageUrl,'https://shop.test-store.com/item');assert.equal(first.data.matches[0].width,1200);
  assert.equal(f.props.SELLER_USED,'1');assert.equal(f.calls.length,2);assert.equal(f.calls[0].options.method,'post');assert.equal(f.calls[0].options.payload.api_key,searchKey);
  assert.equal(new URL(f.calls[1].url).searchParams.get('type'),'products');
  assert.equal(JSON.stringify(first).includes(searchKey),false);assert.equal(JSON.stringify(first).includes('image_id'),false);
  assert.equal(f.request('sellerSearch',{image:'/9j/2Q=='}).ok,true);assert.equal(f.calls.length,2);
});
test('search cap is enforced before provider work and oversized photos do not use allowance',()=>{
  const f=fixture();f.props.SELLER_MONTH='2026-10';f.props.SELLER_USED='250';assert.match(f.request('sellerSearch',{image:'/9j/2Q=='}).error,/monthly search limit/);assert.equal(f.calls.length,0);
  f.props.SELLER_USED='0';const oversized=Buffer.alloc(500001);oversized.set([255,216]);oversized.set([255,217],oversized.length-2);assert.equal(f.request('sellerSearch',{image:oversized.toString('base64')}).ok,false);assert.equal(f.props.SELLER_USED,'0');
});
test('URLs and result IDs cannot be used as an arbitrary private-resource fetcher',()=>{
  const f=fixture();for(const url of ['http://store.com/a','https://localhost/a','https://127.0.0.1/a','https://[::1]/a','https://user:pass@store.com/a','https://store.com:444/a','https://evil\\@store.com/a','https://metadata.google.internal/a','javascript:alert(1)'])assert.equal(f.context.publicPhotoUrl_(url),'',url);
  assert.equal(f.request('sellerImage',{id,url:'https://store.com/image.jpg'}).ok,false);assert.equal(f.calls.length,0);
  for(const ip of ['127.0.0.1','10.1.2.3','169.254.169.254','192.168.0.1','100.64.0.1','::1','::ffff:127.0.0.1','fe80::1','fc00::1'])assert.equal(f.context.publicImageAddress_(ip),false,ip);
});
test('seller download is restricted to cached results and verifies image bytes',()=>{
  const f=fixture();f.cache.set('seller-image:'+id,JSON.stringify({image:'https://shop.test-store.com/photo.jpg',page:'https://shop.test-store.com/item',source:'Test store'}));
  const result=f.request('sellerImage',{id});assert.equal(result.ok,true);assert.equal(result.data.mime,'image/jpeg');assert.equal(result.data.source.label,'Test store');assert.equal(f.calls.length,3);
  f.setHandler(url=>url.startsWith('https://dns.google/')?response({Status:0,Answer:[{type:1,data:'10.0.0.1'}]}):response({}));assert.equal(f.request('sellerImage',{id}).ok,false);
});
test('redirect targets are revalidated before they can be fetched',()=>{
  const f=fixture();f.cache.set('seller-image:'+id,JSON.stringify({image:'https://shop.test-store.com/photo.jpg'}));f.setHandler(url=>url.startsWith('https://dns.google/')?response({Status:0,Answer:[{type:1,data:'93.184.215.14'}]}):{...response({},302),getAllHeaders:()=>({Location:'https://127.0.0.1/private'})});
  assert.equal(f.request('sellerImage',{id}).ok,false);assert.equal(f.calls.some(call=>call.url.includes('127.0.0.1')),false);
});
test('provider failures never expose secrets and leave configuration unchanged',()=>{
  const f=fixture();f.setHandler(()=>response({error:'secret diagnostic '+searchKey},401));const r=f.request('sellerKey',{key:'c'.repeat(64)});assert.equal(r.ok,false);assert.equal(f.props.SERPAPI_KEY,searchKey);assert.equal(JSON.stringify(r).includes(searchKey),false);
  f.setHandler(()=>response({},429));assert.match(f.request('sellerSearch',{image:'/9j/2Q=='}).error,/allowance/);
  assert.equal(f.request('sellerKey',{key:''}).ok,true);assert.equal(f.props.SERPAPI_KEY,undefined);
});
