// These functions are reachable only after doPost authenticates the wardrobe key.
const SELLER_SEARCH_LIMIT = 250;
function sellerStatus_(){
  const props=PropertiesService.getScriptProperties(),month=Utilities.formatDate(new Date(),'Asia/Manila','yyyy-MM');
  return {configured:!!props.getProperty('SERPAPI_KEY'),used:props.getProperty('SELLER_MONTH')===month?Number(props.getProperty('SELLER_USED')||0):0,limit:SELLER_SEARCH_LIMIT};
}
function sellerKey_(p){
  if(typeof p.key!=='string'||(p.key!==''&&!/^[a-f0-9]{64}$/i.test(p.key)))fail_('Copy the complete SerpApi key.');
  if(p.key)providerJSON_('https://serpapi.com/account.json?api_key='+encodeURIComponent(p.key));
  const props=PropertiesService.getScriptProperties();
  if(p.key)props.setProperty('SERPAPI_KEY',p.key);else props.deleteProperty('SERPAPI_KEY');
  return sellerStatus_();
}
function providerJSON_(url,options){
  let response;
  try{response=UrlFetchApp.fetch(url,Object.assign({muteHttpExceptions:true,followRedirects:false,validateHttpsCertificates:true},options||{}));}catch(_){fail_('The image-search service could not be reached. Try Google Lens below.');}
  const code=response.getResponseCode();
  if(code===401||code===403)fail_('The search key was rejected. Check it in Preferences.');
  if(code===429)fail_('Your image-search allowance is used up. Use Google Lens or try again later.');
  if(code!==200)fail_('Image search is temporarily unavailable. Try Google Lens below.');
  let data;try{data=JSON.parse(response.getContentText());}catch(_){fail_('Image search returned an unreadable response. Try again later.');}
  // Never forward provider diagnostics: they can include API keys or request URLs.
  if(data.error){if(/hasn.t returned any results|no results/i.test(data.error))return {visual_matches:[]};fail_('Image search could not complete. Check your search account or use Google Lens.');}
  return data;
}
function reserveSellerSearch_(){
  const lock=LockService.getScriptLock();if(!lock.tryLock(3000))fail_('Another request is in progress. Try photo search again in a moment.');
  try{
    const status=sellerStatus_();if(!status.configured)fail_('Connect a SerpApi search key in Preferences, or use Google Lens.');
    if(status.used>=status.limit)fail_('WearNext has reached its monthly search limit. Use Google Lens until next month.');
    const props=PropertiesService.getScriptProperties();props.setProperty('SELLER_MONTH',Utilities.formatDate(new Date(),'Asia/Manila','yyyy-MM'));props.setProperty('SELLER_USED',String(status.used+1));
  }finally{lock.releaseLock();}
}
function publicPhotoUrl_(value){
  if(typeof value!=='string'||value.length>4096||/[\s\\\u0000-\u001f]/.test(value))return '';
  // No credentials, ports, IP literals, private suffixes or alternate URL schemes.
  const match=value.match(/^https:\/\/([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(\/[^#]*)?(?:#.*)?$/i);
  if(!match)return '';
  const host=match[1].toLowerCase(),labels=host.split('.');
  if(labels.length<2||!labels.every(part=>/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part))||!/^[a-z]{2,63}$/.test(labels[labels.length-1]))return '';
  if(/\.(localhost|local|internal|test|invalid|example|home|lan|onion)$/.test(host)||host==='metadata.google.internal')return '';
  return value.split('#')[0];
}
function sellerMatches_(data){
  const seen={},cache=CacheService.getScriptCache(),matches=[];
  // Keep provider relevance order; do not label lookalikes as exact matches.
  (Array.isArray(data.visual_matches)?data.visual_matches:[]).slice(0,60).forEach(item=>{
    if(matches.length>=12)return;
    const image=publicPhotoUrl_(item.image),page=publicPhotoUrl_(item.link),thumbnail=publicPhotoUrl_(item.thumbnail)||image;
    if(!image||!page||seen[image])return;seen[image]=true;
    const id=Utilities.getUuid(),title=String(item.title||'Possible match').slice(0,180),source=String(item.source||page.split('/')[2]).slice(0,100);
    cache.put('seller-image:'+id,JSON.stringify({image,page,source}),1800);
    matches.push({id,title,source,pageUrl:page,thumbnail,width:Math.max(0,Number(item.image_width)||0),height:Math.max(0,Number(item.image_height)||0)});
  });
  return {matches};
}
function sellerSearch_(p){
  const bytes=jpeg_(p.image);if(bytes.length>500000)fail_('The search photo is too large. Try a smaller photo.');
  const key=PropertiesService.getScriptProperties().getProperty('SERPAPI_KEY');if(!key)fail_('Connect a SerpApi search key in Preferences, or use Google Lens.');
  const digest=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,bytes).map(b=>('0'+(b&255).toString(16)).slice(-2)).join('');
  const cache=CacheService.getScriptCache(),cached=cache.get('seller-search:'+digest);if(cached)return Object.assign(JSON.parse(cached),{status:sellerStatus_()});
  reserveSellerSearch_();
  const uploaded=providerJSON_('https://serpapi.com/image',{method:'post',payload:{image:Utilities.newBlob(bytes,'image/jpeg','clothing-search.jpg'),api_key:key}});
  if(typeof uploaded.image_id!=='string'||uploaded.image_id.length>500)fail_('The search photo could not be uploaded. Try Google Lens.');
  const data=providerJSON_('https://serpapi.com/search.json?engine=google_lens&type=products&auto_crop=true&image_id='+encodeURIComponent(uploaded.image_id)+'&hl=en&country=ph&api_key='+encodeURIComponent(key));
  const result=sellerMatches_(data);cache.put('seller-search:'+digest,JSON.stringify(result),600);return Object.assign(result,{status:sellerStatus_()});
}
function publicImageAddress_(ip){
  if(typeof ip!=='string')return false;
  if(ip.indexOf(':')>=0){
    // Only global unicast IPv6. This also rejects mapped IPv4 and link-local addresses.
    return /^[23][0-9a-f]{0,3}:/i.test(ip)&&!/^2001:0?db8:/i.test(ip);
  }
  if(!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip))return false;
  const a=ip.split('.').map(Number);if(a.some(n=>n>255))return false;
  return !(a[0]===0||a[0]===10||a[0]===127||a[0]>=224||(a[0]===100&&a[1]>=64&&a[1]<=127)||(a[0]===169&&a[1]===254)||(a[0]===172&&a[1]>=16&&a[1]<=31)||(a[0]===192&&(a[1]===168||a[1]===0))||(a[0]===198&&(a[1]===18||a[1]===19||a[1]===51))||(a[0]===203&&a[1]===0&&a[2]===113));
}
function checkImageHost_(url){
  const host=url.split('/')[2];let addresses=[];
  // UrlFetch cannot pin a DNS address. Reject non-public answers before each hop,
  // and accept only opaque image IDs originating from authenticated search results.
  ['A','AAAA'].forEach(type=>{
    let data;try{const response=UrlFetchApp.fetch('https://dns.google/resolve?name='+encodeURIComponent(host)+'&type='+type,{muteHttpExceptions:true,followRedirects:false});if(response.getResponseCode()!==200)throw new Error();data=JSON.parse(response.getContentText());}catch(_){fail_('Could not verify the image host. Save the seller photo and upload it instead.');}
    if(data.Status!==0)fail_('Could not verify the image host. Save the seller photo and upload it instead.');
    addresses=addresses.concat((data.Answer||[]).filter(answer=>answer.type===1||answer.type===28).map(answer=>answer.data));
  });
  if(!addresses.length||addresses.some(ip=>!publicImageAddress_(ip)))fail_('This image host is not supported. Save the seller photo and upload it instead.');
}
function sellerImage_(p){
  const id=id_(p.id),stored=CacheService.getScriptCache().get('seller-image:'+id);if(!stored)fail_('This result has expired. Search again to refresh the seller photos.');
  const match=JSON.parse(stored);let url=match.image,response;
  for(let hop=0;hop<4;hop++){
    url=publicPhotoUrl_(url);if(!url)fail_('This seller image address is not supported.');checkImageHost_(url);
    try{response=UrlFetchApp.fetch(url,{muteHttpExceptions:true,followRedirects:false,validateHttpsCertificates:true,headers:{Accept:'image/jpeg,image/png,image/webp'}});}catch(_){fail_('The seller blocked the download. Save its photo and upload it instead.');}
    const code=response.getResponseCode();
    if([301,302,303,307,308].includes(code)){
      const headers=response.getAllHeaders(),name=Object.keys(headers).find(key=>key.toLowerCase()==='location'),location=name?String(headers[name]):'';
      url=location.startsWith('/')&&!location.startsWith('//')?'https://'+url.split('/')[2]+location:location;continue;
    }
    if(code!==200)fail_('The seller blocked the download. Save its photo and upload it instead.');
    const bytes=response.getBlob().getBytes(),b=bytes.map(n=>n&255);if(!b.length||b.length>8*1024*1024)fail_('This seller photo is too large. Save a smaller photo and upload it.');
    let mime='';if(b[0]===255&&b[1]===216&&b[b.length-2]===255&&b[b.length-1]===217)mime='image/jpeg';
    else if([137,80,78,71,13,10,26,10].every((n,i)=>b[i]===n))mime='image/png';
    else if(b.length>12&&String.fromCharCode.apply(null,b.slice(0,4))==='RIFF'&&String.fromCharCode.apply(null,b.slice(8,12))==='WEBP')mime='image/webp';
    if(!mime)fail_('This result is not a supported photo. Save a JPG, PNG or WebP from the seller.');
    return {mime,data:Utilities.base64Encode(bytes),source:{url:match.page,label:match.source}};
  }
  fail_('The seller image redirected too many times. Save its photo and upload it instead.');
}
function photoSourceFields_(p){
  const url=p.photoSourceUrl?publicPhotoUrl_(p.photoSourceUrl):'';if(p.photoSourceUrl&&!url)fail_('Check the seller source link.');
  return {photo_source_url:url,photo_source_label:typeof p.photoSourceLabel==='string'?p.photoSourceLabel.slice(0,100):''};
}
function ensurePhotoSourceColumns_(){
  const sheet=sheet_('Wardrobe'),headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
  ['photo_source_url','photo_source_label'].forEach(header=>{if(headers.indexOf(header)<0){headers.push(header);sheet.getRange(1,headers.length).setValue(header);}});
}
