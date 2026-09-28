import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const compiled=ts.transpileModule(readFileSync(new URL('../lib/client.ts',import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
function fixture(fail=false){
  const exports={},calls=[];
  const saved={pieces:[{id:'test-upload'}],wears:[],preferences:{}};
  class Reader{
    readAsDataURL(blob){void blob.arrayBuffer().then(bytes=>{this.result='data:image/jpeg;base64,'+Buffer.from(bytes).toString('base64');this.onload();});}
  }
  runInNewContext(compiled,{exports,require:()=>({apiRequest:async(action,payload)=>{
    calls.push({action,payload});if(fail&&action==='upload')throw Error('Upload failed');
    return action==='upload'?saved:{mime:'image/jpeg',data:'retrieved-photo'};
  }}),FileReader:Reader,crypto,URL});
  const form=new FormData();
  form.append('id','test-upload');form.append('data',JSON.stringify({name:'Blue shirt'}));
  form.append('photo',new Blob(['display']));form.append('original',new Blob(['source']));
  return {client:exports,calls,saved,form};
}
test('upload returns server-confirmed state and reuses the saved photo without downloading again',async()=>{
  const {client,calls,saved,form}=fixture();
  assert.equal(await client.jsonRequest('/api/upload',{body:form}),saved);
  assert.equal(calls.length,1);
  assert.equal(calls[0].payload.photo,Buffer.from('display').toString('base64'));
  assert.equal(calls[0].payload.original,Buffer.from('source').toString('base64'));
  assert.equal(await client.photoSource('test-upload'),'data:image/jpeg;base64,'+Buffer.from('display').toString('base64'));
  assert.equal(calls.length,1);
});
test('failed upload never seeds a photo into the saved-photo cache',async()=>{
  const {client,calls,form}=fixture(true);
  await assert.rejects(client.jsonRequest('/api/upload',{body:form}),/Upload failed/);
  assert.equal(await client.photoSource('test-upload'),'data:image/jpeg;base64,retrieved-photo');
  assert.deepEqual(calls.map(c=>c.action),['upload','photo']);
});
test('retrying the same photo keeps its upload operation id',()=>{
  const {client}=fixture();const photo=new Blob(['image']);
  assert.equal(client.uploadId(photo),client.uploadId(photo));
  assert.notEqual(client.uploadId(photo),client.uploadId(new Blob(['image'])));
});
