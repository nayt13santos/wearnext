import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateConnection,apiRequest} from '../lib/connection.ts';
const connection={apiUrl:'https://script.google.com/macros/s/test-deployment/exec',token:'a'.repeat(64)};
test('connection accepts only Google deployments and keeps keys out of URLs',()=>{
  assert.deepEqual(validateConnection(connection),connection);
  for(const apiUrl of ['https://evil.example/exec','http://script.google.com/macros/s/id/exec','https://script.google.com.evil.example/macros/s/id/exec',connection.apiUrl+'?token=abc','https://script.google.com/macros/s/id/dev'])assert.throws(()=>validateConnection({...connection,apiUrl}));
  assert.throws(()=>validateConnection({...connection,token:'short'}));
});
test('API uses text/plain-compatible POST without cookies or secret URL parameters',async()=>{
  const original=globalThis.fetch;globalThis.fetch=async(url,options)=>{assert.equal(url,connection.apiUrl);assert.equal(options?.headers,undefined);assert.equal(options?.method,'POST');assert.equal(options?.credentials,'omit');assert.equal(JSON.parse(String(options?.body)).token,connection.token);return new Response(JSON.stringify({ok:true,data:{pieces:[]}}));};
  try{assert.deepEqual(await apiRequest('state',{},connection),{pieces:[]});}finally{globalThis.fetch=original;}
});
test('backend authentication errors are shown instead of treating failure as success',async()=>{
  const original=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({ok:false,error:'Incorrect connection key'}));
  try{await assert.rejects(apiRequest('state',{},connection),/Incorrect connection key/);}finally{globalThis.fetch=original;}
});
