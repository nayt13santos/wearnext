import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const require=createRequire(import.meta.url);
const disconnected={configured:false,used:0,limit:250};
const configured={...disconnected,configured:true};

// Exercise the real event handlers and hook lifecycle; layout is checked in the browser.
function component(file,props,modules){
  let index=0,dirty=false,tree;
  const hooks=[],effects=[];
  const react={...require('react'),useState(initial){
    const i=index++;hooks[i]??={value:typeof initial==='function'?initial():initial};
    return [hooks[i].value,next=>{const value=typeof next==='function'?next(hooks[i].value):next;
      if(!Object.is(value,hooks[i].value)){hooks[i].value=value;dirty=true;}}];
  },useRef(initial){const i=index++;hooks[i]??={current:initial};return hooks[i];},
  useEffect(callback,deps){const i=index++,old=hooks[i];
    if(!old||deps.some((d,j)=>!Object.is(d,old.deps[j])))effects.push(()=>{
      old?.cleanup?.();hooks[i]={deps,cleanup:callback()};
    });
  }};
  const source=readFileSync(new URL('../app/'+file,import.meta.url),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,
    jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};
  runInNewContext(compiled,{exports,AbortController,URL,
    require:id=>id==='react'?react:modules[id]??require(id)});
  function render(){let count=0;do{dirty=false;index=0;tree=exports.default(props);
    effects.splice(0).forEach(fn=>fn());if(++count>20)throw Error('Render loop');}while(dirty);}
  function nodes(){render();const found=[];function visit(node){if(Array.isArray(node))return node.forEach(visit);
    if(!node||typeof node!=='object')return;found.push(node);visit(node.props?.children);}visit(tree);return found;}
  function text(node){if(Array.isArray(node))return node.map(text).join('');
    if(node==null||typeof node==='boolean')return '';
    return typeof node==='object'?text(node.props?.children):String(node);}
  const button=label=>nodes().find(n=>n.type==='button'&&text(n)===label);
  const settle=async()=>{await new Promise(resolve=>setImmediate(resolve));render();};
  render();return {nodes,text,button,settle,props};
}

function search({connected=true,status=disconnected,apiRequest,findSellerPhotos}={}){
  const activity=[],searches=[],original=new Blob(['original']);
  const ui=component('seller-photo-search.tsx',{original,disabled:false,onUse:async()=>{},onBusy:v=>activity.push(v)},
    {'@/lib/connection':{readConnection:()=>connected?{}:null,apiRequest:apiRequest??(async()=>status)},
      '@/lib/seller-photos':{findSellerPhotos:findSellerPhotos??(async photo=>{searches.push(photo);return {matches:[],status};})},
      './photo-search-settings':{default:'PhotoSearchSettings'}});
  return {...ui,activity,searches,original,setup:()=>ui.nodes().find(n=>n.type==='PhotoSearchSettings')};
}

test('missing search key leaves the button active and opens setup without submitting the photo',async()=>{
  const ui=search();await ui.settle();
  assert.equal(ui.button('Find seller photos').props.disabled,false);
  ui.button('Find seller photos').props.onClick();await ui.settle();
  assert.equal(ui.setup().props.connected,true);
  assert.equal(ui.setup().props.initialStatus.configured,false);
  assert.equal(ui.searches.length,0);
  assert.deepEqual(ui.activity,[true,false]);
});

test('successful inline setup activates search using the same uploaded original',async()=>{
  let status=disconnected;
  const ui=search({apiRequest:async()=>status});await ui.settle();
  ui.button('Find seller photos').props.onClick();await ui.settle();
  ui.setup().props.onBusy(true);assert.equal(ui.button('Find seller photos').props.disabled,true);
  const setup=ui.setup();status=configured;
  setup.props.onStatusChange(configured);setup.props.onBusy(false);
  assert.equal(ui.setup(),undefined);
  ui.button('Find seller photos').props.onClick();await ui.settle();
  assert.deepEqual(ui.searches,[ui.original]);
  assert.equal(ui.button('Find seller photos').props.disabled,false);
});

test('a failed initial status request can be retried from Find seller photos',async()=>{
  let calls=0;
  const ui=search({apiRequest:async()=>{if(++calls===1)throw Error('Offline');return configured;}});
  await ui.settle();assert.ok(ui.nodes().find(n=>n.props?.role==='alert'));
  ui.button('Find seller photos').props.onClick();await ui.settle();
  assert.equal(ui.searches.length,1);
  assert.equal(ui.nodes().some(n=>n.props?.role==='alert'),false);
});

test('disconnected preview opens connection guidance without any backend request',async()=>{
  const ui=search({connected:false,apiRequest:async()=>{throw Error('Unexpected request');}});
  assert.equal(ui.button('Find seller photos').props.disabled,false);
  ui.button('Find seller photos').props.onClick();await ui.settle();
  assert.equal(ui.setup().props.connected,false);
  assert.equal(ui.searches.length,0);
});

test('quota exhaustion explains the Lens fallback and a later reset is picked up',async()=>{
  let status={...configured,used:250};
  const ui=search({apiRequest:async()=>status});await ui.settle();
  ui.button('Find seller photos').props.onClick();await ui.settle();
  assert.equal(ui.searches.length,0);
  assert.match(ui.text(ui.nodes().find(n=>n.props?.role==='alert')),/Open Google Lens/);
  assert.equal(ui.button('Find seller photos').props.disabled,false);
  status=configured;ui.button('Find seller photos').props.onClick();await ui.settle();
  assert.equal(ui.searches.length,1);
});

test('inline key form notifies its parent only after the backend accepts the key',async()=>{
  const statuses=[],activity=[],calls=[];
  let accept=false;
  const ui=component('photo-search-settings.tsx',{connected:true,initialStatus:disconnected,
    onStatusChange:s=>statuses.push(s),onBusy:b=>activity.push(b)},
    {'@/lib/connection':{apiRequest:async(action,payload)=>{
      calls.push([action,payload.key]);if(!accept)throw Error('Check your search key');return configured;
    }}});
  ui.nodes().find(n=>n.type==='input').props.onChange({target:{value:'a'.repeat(64)}});
  const submit=()=>ui.nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
  submit();await ui.settle();
  assert.equal(statuses.length,0);assert.ok(ui.nodes().find(n=>n.props?.role==='alert'));
  accept=true;submit();await ui.settle();
  assert.deepEqual(statuses,[configured]);assert.deepEqual(activity,[true,false,true,false]);
  assert.deepEqual(calls,[['sellerKey','a'.repeat(64)],['sellerKey','a'.repeat(64)]]);
  assert.equal(ui.nodes().find(n=>n.type==='input').props.value,'');
});
