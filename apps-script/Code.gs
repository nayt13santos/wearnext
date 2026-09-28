/** WearNext: independent Google Sheets + private Drive backend.
 * Run setupWearNext once in the editor using your PERSONAL Google account.
 * Never paste the connection key into source code or a public repository.
 */
const VERSION = '1.0.0';
const DEFAULTS = {cooldown:30,city:'Marikina',latitude:14.65,longitude:121.1,budget:1500,currency:'PHP'};
const CATEGORIES = ['Top','Bottom','One-piece','Shoes','Layer','Accessory'];
const OCCASIONS = ['Everyday','Office','Dinner out','Formal event','Workout','Travel'];
const COLORS = ['White','Black','Grey','Navy','Blue','Green','Beige','Brown','Red','Pink','Purple','Yellow','Orange','Multicolor'];
const HEADERS = {
  Wardrobe:['id','name','category','color','style','warmth','pattern','material','waterproof','laundry','archived','favorite','photo_file_id','original_file_id','fingerprint','created_at','updated_at'],
  WearHistory:['id','day','occasion','temperature','item_ids','items_json','voided','created_at','request_id'],
  Preferences:['setting','value'],
  Setup:['setting','value','notes']
};

// Owner-only editor function. It is never dispatched by doPost.
function setupWearNext() {
  const owner=Session.getEffectiveUser().getEmail();
  if(!owner)throw new Error('Run setup while signed in to your personal Google account.');
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try {
    const props=PropertiesService.getScriptProperties();
    if(props.getProperty('OWNER_EMAIL')&&props.getProperty('OWNER_EMAIL')!==owner)throw new Error('This wardrobe already belongs to a different Google account.');
    props.setProperty('OWNER_EMAIL',owner);
    let id=props.getProperty('SHEET_ID');
    if(!id){const created=SpreadsheetApp.create('WearNext — Wardrobe');id=created.getId();props.setProperty('SHEET_ID',id);}
    const book=SpreadsheetApp.openById(id);book.setSpreadsheetTimeZone('Asia/Manila');
    Object.keys(HEADERS).forEach(name=>{
      let sheet=book.getSheetByName(name);
      if(!sheet){const initial=book.getSheets();sheet=initial.length===1&&initial[0].getName()==='Sheet1'&&initial[0].getLastRow()===0?initial[0].setName(name):book.insertSheet(name);}
      if(sheet.getLastRow()===0)sheet.getRange(1,1,1,HEADERS[name].length).setValues([HEADERS[name]]);
      const actual=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
      HEADERS[name].forEach(header=>{if(actual.indexOf(header)<0){actual.push(header);sheet.getRange(1,actual.length).setValue(header);}});
      sheet.setFrozenRows(1);sheet.getRange(1,1,1,actual.length).setBackground('#234edb').setFontColor('#ffffff').setFontWeight('bold');sheet.setColumnWidths(1,actual.length,140);
    });
    let folder=props.getProperty('FOLDER_ID');
    if(!folder){folder=Drive.Files.create({name:'WearNext — Private photos',mimeType:'application/vnd.google-apps.folder'}).id;props.setProperty('FOLDER_ID',folder);}
    let token=props.getProperty('CONNECTION_KEY');
    if(!token){token=(Utilities.getUuid()+Utilities.getUuid()).replace(/-/g,'');props.setProperty('CONNECTION_KEY',token);}
    const existing=rows_('Preferences');
    Object.keys(DEFAULTS).forEach(key=>{if(!existing.some(r=>r.setting===key))append_('Preferences',{setting:key,value:DEFAULTS[key]});});
    upsertSetting_('Setup','connection_key',token,'Private. Anyone with this key can access your wardrobe. Do not share it publicly.');
    upsertSetting_('Setup','owner',owner,'Use this personal Google account for setup.');
    upsertSetting_('Setup','photos','https://drive.google.com/drive/folders/'+folder,'Private folder. Do not enable link sharing.');
    upsertSetting_('Setup','app','https://nayt13santos.github.io/wearnext/','Open in your phone browser, then Add to Home Screen.');
    upsertSetting_('Setup','api_url',ScriptApp.getService().getUrl()||'Deploy as a web app and paste its /exec URL in the phone.','Deploy: execute as Me, access Anyone. Every data request still requires the private key.');
    SpreadsheetApp.flush();
    console.log('Ready. Open your private Setup tab: '+book.getUrl());
    return {spreadsheet:book.getUrl(),photos:'https://drive.google.com/drive/folders/'+folder,owner:owner};
  } finally {lock.releaseLock();}
}

// Explicit owner action to invalidate all existing device keys.
function rotateConnectionKey() {
  const props=PropertiesService.getScriptProperties();
  if(Session.getEffectiveUser().getEmail()!==props.getProperty('OWNER_EMAIL'))throw new Error('Only the owner may rotate this key.');
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try{const token=(Utilities.getUuid()+Utilities.getUuid()).replace(/-/g,'');props.setProperty('CONNECTION_KEY',token);upsertSetting_('Setup','connection_key',token,'Key rotated. Reconnect each device.');}finally{lock.releaseLock();}
}

function doGet(){return json_({ok:true,data:{app:'WearNext',version:VERSION}});}
function doPost(e) {
  let lock;
  try {
    const text=e&&e.postData&&e.postData.contents;
    if(typeof text!=='string'||text.length>9*1024*1024)fail_('Request is missing or too large.');
    let body;try{body=JSON.parse(text);}catch(_){fail_('Request is not valid JSON.');}
    const expected=PropertiesService.getScriptProperties().getProperty('CONNECTION_KEY');
    if(!expected||!constantEqual_(body&&body.token,expected))fail_('Connection key is missing or incorrect. Check your private Setup sheet.');
    const action=body.action,payload=body.payload||{};
    if(action==='photo')return json_({ok:true,data:photo_(payload)});
    if(!['state','upload','piece','wear','undo','settings'].includes(action))fail_('Unknown action.');
    lock=LockService.getScriptLock();if(!lock.tryLock(25000))fail_('Another save is in progress. Refresh and try again.');
    if(action==='upload')upload_(payload);
    if(action==='piece')editPiece_(payload);
    if(action==='wear')recordWear_(payload);
    if(action==='undo')undoWear_(payload);
    if(action==='settings')saveSettings_(payload);
    SpreadsheetApp.flush();
    return json_({ok:true,data:state_()});
  }catch(error){
    // Never send raw Google exceptions, credentials or file details to callers.
    const message=error&&error.userVisible?error.message:'Google storage could not complete the request. Refresh before retrying. Ask the owner to check setup and permissions if this continues.';
    return json_({ok:false,error:message});
  }finally{if(lock)lock.releaseLock();}
}
function json_(data){return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);}
function fail_(message){const e=new Error(message);e.userVisible=true;throw e;}
function constantEqual_(a,b){if(typeof a!=='string'||a.length!==b.length)return false;let diff=0;for(let i=0;i<b.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
function book_(){const id=PropertiesService.getScriptProperties().getProperty('SHEET_ID');if(!id)fail_('The owner needs to run setupWearNext first.');return SpreadsheetApp.openById(id);}
function sheet_(name){const sheet=book_().getSheetByName(name);if(!sheet)fail_('A storage tab is missing. Ask the owner to rerun setupWearNext.');return sheet;}
function rows_(name){const sheet=sheet_(name),all=sheet.getDataRange().getValues(),headers=all.shift();return all.map((values,i)=>{const r={_row:i+2};headers.forEach((h,j)=>{r[h]=values[j];});return r;}).filter(r=>r.id||r.setting);}
function safeCell_(value){if(value===undefined||value===null)return '';return typeof value==='string'&&/^[=+@-]/.test(value)?"'"+value:value;}
function write_(name,row,data){const sheet=sheet_(name),headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0],range=sheet.getRange(row,1,1,headers.length);range.setNumberFormat('@');range.setValues([headers.map(h=>safeCell_(data[h]))]);}
function append_(name,data){write_(name,sheet_(name).getLastRow()+1,data);}
function upsertSetting_(tab,key,value,notes){const row=rows_(tab).find(r=>r.setting===key);const data={setting:key,value:value,notes:notes||''};if(row)write_(tab,row._row,data);else append_(tab,data);}
function bool_(value){return value===true||value==='TRUE'||value==='true';}
function piece_(row){return {id:row.id,name:row.name,category:row.category,color:row.color,style:row.style,warmth:Number(row.warmth),pattern:row.pattern,material:row.material,waterproof:bool_(row.waterproof),laundry:bool_(row.laundry),archived:bool_(row.archived),favorite:bool_(row.favorite),fingerprint:row.fingerprint,image:'wardrobe-photo:'+row.id};}
function state_(){
  const preferences=Object.assign({},DEFAULTS);rows_('Preferences').forEach(row=>{if(Object.prototype.hasOwnProperty.call(DEFAULTS,row.setting))preferences[row.setting]=typeof DEFAULTS[row.setting]==='number'?Number(row.value):String(row.value);});
  return {pieces:rows_('Wardrobe').map(piece_).reverse(),wears:rows_('WearHistory').filter(r=>!bool_(r.voided)).map(r=>({id:r.id,day:String(r.day),occasion:r.occasion,temperature:Number(r.temperature),items:JSON.parse(r.items_json)})).sort((a,b)=>b.day.localeCompare(a.day)),preferences:validatePreferences_(preferences)};
}
function text_(value,name,max){if(typeof value!=='string'||!value.trim()||value.trim().length>max||/[\u0000-\u001f]/.test(value))fail_('Check '+name+'.');return value.trim();}
function number_(value,name,min,max,integer){if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||(integer&&!Number.isInteger(value)))fail_('Check '+name+'.');return value;}
function enum_(value,options,name){if(!options.includes(value))fail_('Check '+name+'.');return value;}
function id_(value){if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))fail_('Invalid item reference. Refresh the app.');return value;}
function validatePiece_(p){
  if(!p||typeof p!=='object')fail_('Check the clothing details.');
  const result={name:text_(p.name,'the clothing name',100),category:enum_(p.category,CATEGORIES,'the category'),color:enum_(p.color,COLORS,'the color'),style:enum_(p.style,['Casual','Smart','Formal','Sport','Versatile'],'the dress code'),warmth:number_(p.warmth,'the clothing weight',1,3,true),pattern:enum_(p.pattern,['Solid','Striped','Checked','Printed'],'the pattern'),material:enum_(p.material,['Cotton','Linen','Denim','Wool','Synthetic','Leather','Other'],'the material')};
  ['waterproof','laundry','archived','favorite'].forEach(key=>{if(typeof p[key]!=='boolean')fail_('Check '+key+'.');result[key]=p[key];});return result;
}
function validatePreferences_(p){if(!p)fail_('Check preferences.');return {cooldown:number_(p.cooldown,'rotation days',0,90,true),city:text_(p.city,'the weather city',100),latitude:number_(p.latitude,'latitude',-90,90),longitude:number_(p.longitude,'longitude',-180,180),budget:number_(p.budget,'the budget',0,1000000),currency:enum_(p.currency,['PHP','USD','EUR','GBP','JPY'],'the currency')};}
function jpeg_(base64){
  if(typeof base64!=='string'||base64.length>4*1024*1024||base64.length<8||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))fail_('Use a valid processed photo under 3 MB.');
  let bytes;try{bytes=Utilities.base64Decode(base64);}catch(_){fail_('Photo could not be read.');}
  if((bytes[0]&255)!==255||(bytes[1]&255)!==216||(bytes[bytes.length-2]&255)!==255||(bytes[bytes.length-1]&255)!==217)fail_('The processed photo must be a JPEG image.');return bytes;
}
function upload_(p){
  const id=id_(p.id),data=validatePiece_(p.data),bytes=jpeg_(p.photo),original=jpeg_(p.original);
  const fingerprint=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,original).map(b=>('0'+(b&255).toString(16)).slice(-2)).join('');
  const existing=rows_('Wardrobe').find(r=>r.id===id);
  if(existing){if(existing.fingerprint!==fingerprint)fail_('That upload reference is already in use. Reopen the photo and try again.');return;}
  const folder=PropertiesService.getScriptProperties().getProperty('FOLDER_ID');if(!folder)fail_('Photo storage needs owner setup.');
  const created=[];
  try{
    const photo=Drive.Files.create({name:id+'.jpg',parents:[folder]},Utilities.newBlob(bytes,'image/jpeg',id+'.jpg'),{fields:'id'});created.push(photo.id);
    const source=Drive.Files.create({name:id+'-source.jpg',parents:[folder]},Utilities.newBlob(original,'image/jpeg',id+'-source.jpg'),{fields:'id'});created.push(source.id);
    const now=new Date().toISOString();append_('Wardrobe',Object.assign(data,{id:id,photo_file_id:photo.id,original_file_id:source.id,fingerprint:fingerprint,created_at:now,updated_at:now}));
  }catch(error){
    // Only newly created orphan files are sent to trash; never touch unrelated Drive files.
    if(!rows_('Wardrobe').some(r=>r.id===id))created.forEach(file=>{try{Drive.Files.update({trashed:true},file);}catch(_){}});
    throw error;
  }
}
function photo_(p){
  const id=id_(p.id),row=rows_('Wardrobe').find(r=>r.id===id);if(!row)fail_('Clothing photo not found.');
  // The caller supplies a wardrobe id, never an arbitrary Drive file id or URL.
  const response=UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(row.photo_file_id)+'?alt=media',{headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},muteHttpExceptions:true});
  if(response.getResponseCode()!==200)fail_('Photo could not be loaded from private Drive storage.');
  return {mime:'image/jpeg',data:Utilities.base64Encode(response.getBlob().getBytes())};
}
function editPiece_(p){const id=id_(p.id),data=validatePiece_(p.data),row=rows_('Wardrobe').find(r=>r.id===id);if(!row)fail_('Clothing item not found.');write_('Wardrobe',row._row,Object.assign({},row,data,{updated_at:new Date().toISOString()}));}
function saveSettings_(p){const data=validatePreferences_(p.data);Object.keys(data).forEach(key=>upsertSetting_('Preferences',key,data[key]));}
function canWear_(piece,wears,day,cooldown){if(piece.archived||piece.laundry)return false;if(['Shoes','Accessory'].includes(piece.category))return true;const dates=wears.filter(w=>w.day<=day&&w.items.some(p=>p.id===piece.id)).map(w=>w.day).sort();if(!dates.length)return true;return (Date.parse(day+'T00:00:00Z')-Date.parse(dates[dates.length-1]+'T00:00:00Z'))/86400000>=cooldown;}
function recordWear_(p){
  const day=Utilities.formatDate(new Date(),'Asia/Manila','yyyy-MM-dd');if(p.day!==day)fail_('You can plan ahead, but record only what you wear today.');
  const request=id_(p.requestId),history=rows_('WearHistory'),same=history.find(r=>r.request_id===request);if(same)return;
  if(history.some(r=>r.day===day&&!bool_(r.voided)))fail_('An outfit is already recorded today. Undo it in Worn history first.');
  if(!Array.isArray(p.ids)||p.ids.length<2||p.ids.length>8||new Set(p.ids).size!==p.ids.length)fail_('Choose one complete outfit.');p.ids.forEach(id_);
  const state=state_(),items=p.ids.map(id=>state.pieces.find(piece=>piece.id===id));
  if(items.some(item=>!item||!canWear_(item,state.wears,day,state.preferences.cooldown)))fail_('A piece is no longer available. Refresh and generate a new outfit.');
  const count=category=>items.filter(item=>item.category===category).length;
  if(count('Shoes')!==1||count('Layer')>1||!((count('Top')===1&&count('Bottom')===1&&count('One-piece')===0)||(count('One-piece')===1&&count('Top')===0&&count('Bottom')===0)))fail_('Choose a complete outfit with shoes.');
  append_('WearHistory',{id:request,day:day,occasion:enum_(p.occasion,OCCASIONS,'the occasion'),temperature:number_(p.temperature,'the temperature',-40,60),item_ids:JSON.stringify(p.ids),items_json:JSON.stringify(items),voided:false,created_at:new Date().toISOString(),request_id:request});
}
function undoWear_(p){const id=id_(p.id),row=rows_('WearHistory').find(r=>r.id===id);if(!row)fail_('Wear record not found.');write_('WearHistory',row._row,Object.assign({},row,{voided:true}));}
