import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
const source=readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8')+'\n'+readFileSync(new URL('../apps-script/SellerPhotos.gs',import.meta.url),'utf8');
const key='a'.repeat(64),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const piece=(n,category='Top')=>({id:id(n),name:'Test clothing',category,color:'White',style:'Versatile',warmth:1,pattern:'Solid',material:'Cotton',waterproof:false,laundry:false,archived:false,favorite:false,photo_file_id:'private-'+n,fingerprint:'test'});
function fixture(){
  const tables={Wardrobe:[],WearHistory:[],Preferences:[],Setup:[]},props={CONNECTION_KEY:key,FOLDER_ID:'photos',SHEET_ID:'test'};
  let files=0,locks=0,downloads=0,failUpload=false;
  const context=vm.createContext({console,Date,JSON,PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]})},ContentService:{MimeType:{JSON:'application/json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})},SpreadsheetApp:{flush(){}},LockService:{getScriptLock:()=>({tryLock(){locks++;return true;},releaseLock(){}})},Utilities:{formatDate:()=> '2026-09-28',DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,bytes)=>Array.from(createHash('sha256').update(Buffer.from(bytes)).digest()),base64Decode:s=>Array.from(Buffer.from(s,'base64')),base64Encode:b=>Buffer.from(b).toString('base64'),newBlob:bytes=>bytes},Drive:{Files:{create:()=>{if(failUpload)throw new Error('Google private diagnostic must not leak');return {id:'file-'+ ++files};},update(){}}},UrlFetchApp:{fetch:()=>{downloads++;return {getResponseCode:()=>200,getBlob:()=>({getBytes:()=>[255,216,255,217]})};}},ScriptApp:{getOAuthToken:()=> 'never-return-this'}});
  vm.runInContext(source,context);
  context.rows_=name=>tables[name].map((r,i)=>({...r,_row:i+2}));
  context.append_=(name,row)=>tables[name].push(JSON.parse(JSON.stringify(row)));
  context.write_=(name,row,data)=>{tables[name][row-2]=JSON.parse(JSON.stringify(data));};
  const request=(action,payload={},token=key)=>context.doPost({postData:{contents:JSON.stringify({action,payload,token})}});
  return {context,tables,request,get files(){return files;},get locks(){return locks;},get downloads(){return downloads;},failUploads(){failUpload=true;}};
}
test('every private action rejects missing/wrong keys before data access',()=>{
  const f=fixture();for(const action of ['state','upload','photo','piece','wear','undo','settings','sellerStatus','sellerKey','sellerSearch','sellerImage']){assert.equal(f.request(action,{},'').ok,false);assert.equal(f.request(action,{},'b'.repeat(64)).ok,false);}assert.equal(f.files,0);assert.equal(f.locks,0);assert.equal(f.downloads,0);
  assert.equal(f.context.doGet().data.app,'WearNext');assert.equal(JSON.stringify(f.context.doGet()).includes(key),false);
});
test('malformed bodies and arbitrary method dispatch are rejected',()=>{
  const f=fixture();assert.equal(f.context.doPost({postData:{contents:'oops'}}).ok,false);assert.equal(f.request('setupWearNext').ok,false);assert.equal(f.request('rotateConnectionKey').ok,false);assert.equal(f.request('constructor').ok,false);
});
test('state maps rows but never returns Drive IDs or connection key',()=>{
  const f=fixture();f.tables.Wardrobe.push(piece(1));const response=f.request('state');assert.equal(response.ok,true);assert.equal(response.data.preferences.cooldown,30);assert.equal(response.data.pieces[0].image,'wardrobe-photo:'+id(1));assert.equal(JSON.stringify(response).includes('private-1'),false);assert.equal(JSON.stringify(response).includes(key),false);
});
test('uploads validate images, hash on server and deduplicate retry IDs',()=>{
  const f=fixture(),payload={id:id(1),data:piece(1),photo:'/9j/2Q==',original:'/9j/2Q=='};
  assert.equal(f.request('upload',payload).ok,true);assert.equal(f.request('upload',payload).ok,true);assert.equal(f.files,2);assert.equal(f.tables.Wardrobe.length,1);
  assert.equal(f.request('upload',{...payload,original:'/9gAAP/Z'}).ok,false);
  assert.equal(f.request('upload',{...payload,id:id(2),photo:'PHNjcmlwdD4='}).ok,false);assert.equal(f.files,2);
});
test('a photo request only accepts a known wardrobe ID, never arbitrary Drive IDs',()=>{
  const f=fixture();assert.equal(f.request('photo',{id:'some-private-drive-file'}).ok,false);assert.equal(f.request('photo',{id:id(99)}).ok,false);assert.equal(f.downloads,0);
  f.tables.Wardrobe.push(piece(1));const response=f.request('photo',{id:id(1)});assert.equal(response.data.mime,'image/jpeg');assert.equal(f.downloads,1);assert.equal(JSON.stringify(response).includes('never-return-this'),false);
});
test('edits preserve photo references, reject invalid details and cannot edit another id',()=>{
  const f=fixture();f.tables.Wardrobe.push(piece(1));assert.equal(f.request('piece',{id:id(1),data:{...piece(1),name:'Edited',photo_file_id:'attacker',favorite:true}}).ok,true);assert.equal(f.tables.Wardrobe[0].photo_file_id,'private-1');assert.equal(f.tables.Wardrobe[0].favorite,true);
  assert.equal(f.request('piece',{id:id(1),data:{...piece(1),category:'bad'}}).ok,false);assert.equal(f.request('piece',{id:id(3),data:piece(1)}).ok,false);
});
test('wear is today-only, complete, repeat safe, and undo preserves audit history',()=>{
  const f=fixture();f.tables.Wardrobe.push(piece(1),piece(2,'Bottom'),piece(3,'Shoes'));
  const payload={requestId:id(20),ids:[id(1),id(2),id(3)],day:'2026-09-28',occasion:'Everyday',temperature:30};
  assert.equal(f.request('wear',{...payload,day:'2026-09-29'}).ok,false);assert.equal(f.request('wear',{...payload,ids:[id(1),id(3)]}).ok,false);
  assert.equal(f.request('wear',payload).ok,true);assert.equal(f.request('wear',payload).ok,true);assert.equal(f.tables.WearHistory.length,1);
  assert.equal(f.request('wear',{...payload,requestId:id(21)}).ok,false);
  assert.equal(f.request('undo',{id:id(20)}).data.wears.length,0);assert.equal(f.tables.WearHistory.length,1);assert.equal(f.tables.WearHistory[0].voided,true);
  assert.equal(f.request('wear',{...payload,requestId:id(21)}).ok,true);
});
test('server independently enforces 30-day clothing rest with shoe/accessory exemptions',()=>{
  const f=fixture(),history=[{day:'2026-09-01',items:[piece(1),piece(3,'Shoes')]}];
  assert.equal(f.context.canWear_(piece(1),history,'2026-09-30',30),false);assert.equal(f.context.canWear_(piece(1),history,'2026-10-01',30),true);assert.equal(f.context.canWear_(piece(3,'Shoes'),history,'2026-09-28',30),true);assert.equal(f.context.canWear_({...piece(3,'Shoes'),laundry:true},history,'2026-09-28',30),false);
  f.tables.Wardrobe.push(piece(1),piece(2,'Bottom'),piece(3,'Shoes'));f.tables.WearHistory.push({id:id(9),day:'2026-09-01',items_json:JSON.stringify(history[0].items),voided:false});
  assert.equal(f.request('wear',{requestId:id(30),ids:[id(1),id(2),id(3)],day:'2026-09-28',occasion:'Everyday',temperature:30}).ok,false);
});
test('preferences validate boundary values and spreadsheet formula prefixes are escaped',()=>{
  const f=fixture(),data={cooldown:30,city:'Marikina',latitude:14.65,longitude:121.1,budget:0,currency:'PHP'};
  assert.equal(f.request('settings',{data}).data.preferences.budget,0);assert.equal(f.request('settings',{data:{...data,cooldown:91}}).ok,false);assert.equal(f.request('settings',{data:{...data,cooldown:2.5}}).ok,false);
  assert.equal(f.context.safeCell_('=IMPORTXML("bad")'),'\'=IMPORTXML("bad")');assert.equal(f.context.safeCell_('+1'),'\'+1');assert.equal(f.context.safeCell_(0),0);
});
test('raw Google errors stay private',()=>{const f=fixture();f.failUploads();const response=f.request('upload',{id:id(1),data:piece(1),photo:'/9j/2Q==',original:'/9j/2Q=='});assert.equal(response.ok,false);assert.equal(JSON.stringify(response).includes('private diagnostic'),false);});
test('setup preserves a live connection and never supplies an editor-only dev URL',()=>{
  const f=fixture(),live='https://script.google.com/macros/s/test-deployment/exec',dev='https://script.google.com/macros/s/test-dev/dev';
  assert.equal(f.context.liveApiUrl_(live,dev),live);
  assert.equal(f.context.liveApiUrl_('',live),live);
  for(const value of ['',dev,live+'?token=secret','https://other.example/exec'])assert.equal(f.context.liveApiUrl_(value,dev),'Copy the Web app /exec URL from Deploy > Manage deployments.');
});

test('seller-photo saves keep the original fingerprint and retain attribution through ordinary edits',()=>{
  const f=fixture();let migrations=0;f.context.ensurePhotoSourceColumns_=()=>{migrations++;};
  const data={...piece(1),photoSourceUrl:'https://shop.example.com/item',photoSourceLabel:'Example store'};
  assert.equal(f.request('upload',{id:id(1),data,photo:'/9gAAP/Z',original:'/9j/2Q=='}).ok,true);
  assert.equal(migrations,1);const row=f.tables.Wardrobe[0];assert.equal(row.photo_source_url,data.photoSourceUrl);assert.equal(row.photo_source_label,'Example store');
  assert.equal(row.fingerprint,createHash('sha256').update(Buffer.from('/9j/2Q==','base64')).digest('hex'));
  assert.notEqual(row.photo_file_id,row.original_file_id);
  assert.equal(f.request('piece',{id:id(1),data:{...data,name:'Updated name'}}).ok,true);
  assert.equal(f.request('state').data.pieces[0].photoSourceLabel,'Example store');
});
