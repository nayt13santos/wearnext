import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const require=createRequire(import.meta.url);
const source=readFileSync(new URL('../app/piece-editor.tsx',import.meta.url),'utf8')
  .replaceAll('import.meta.env.BASE_URL',JSON.stringify('/wearnext/'));
const compiled=ts.transpileModule(source,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,
}}).outputText;

function result(file){return {blob:new Blob([file.name]),original:new Blob([file.name]),
  url:'blob:'+file.name,color:'Blue',fingerprint:file.name};}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}

// A small hook harness exercises the actual component callbacks and effect
// cleanup without adding a DOM dependency. Browser rendering is checked separately.
function editor(processPhoto,recognizeCategory=async()=>({category:'Top',confidence:.9,label:'shirt'})){
  let index=0,dirty=false,tree,closed=0;
  const hooks=[],effects=[],saved=[],revoked=[];
  const props={open:true,onClose:()=>{closed++;},onSave:async piece=>{saved.push(piece.name);}};
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
  const modules={react,'./photo-picker':{default:'PhotoPicker'},
    '@/lib/category-recognition':{recognizeCategory},'@/lib/photo':{processPhoto},'@/lib/client':{},'@/lib/wardrobe':{categories:[],colors:[]}};
  const exports={};
  runInNewContext(compiled,{exports,AbortController,URL:{revokeObjectURL:url=>revoked.push(url)},
    require:id=>modules[id]||(id.startsWith('@/components/')?new Proxy({}, {get:(_,key)=>String(key)}):require(id))});
  function render(){let count=0;do{dirty=false;index=0;tree=exports.default(props);
    effects.splice(0).forEach(fn=>fn());if(++count>20)throw Error('Render loop');}while(dirty);return tree;}
  function nodes(){render();const found=[];function visit(node){if(Array.isArray(node))return node.forEach(visit);
    if(!node||typeof node!=='object')return;found.push(node);visit(node.props?.children);}visit(tree);return found;}
  function text(node){if(Array.isArray(node))return node.map(text).join('');
    if(node===null||node===undefined||typeof node==='boolean')return '';
    return typeof node==='object'?text(node.props?.children):String(node);}
  const picker=()=>nodes().find(n=>n.type==='PhotoPicker');
  const button=label=>nodes().find(n=>n.type==='button'&&text(n)===label);
  const saveButton=()=>nodes().find(n=>n.type==='button'&&n.props.className==='primary full');
  const settle=async()=>{await new Promise(resolve=>setImmediate(resolve));render();};
  render();return {props,render,nodes,text,picker,button,saveButton,settle,saved,revoked,
    get tree(){return tree;},get closed(){return closed;}};
}

test('closing during processing and reopening restores usable inputs and ignores the stale result',async()=>{
  const pending=deferred(),e=editor(()=>pending.promise),file={name:'slow.jpg'};
  e.picker().props.onChoose([file]);assert.equal(e.picker().props.disabled,true);
  e.props.open=false;e.render();e.props.open=true;e.render();
  assert.equal(e.picker().props.disabled,false);
  pending.resolve(result(file));await e.settle();
  assert.equal(e.picker().props.children,null);
  assert.equal(e.saveButton().props.disabled,true);
  assert.deepEqual(e.revoked,['blob:slow.jpg']);
});

test('a stale processing error cannot replace a newly opened photo',async()=>{
  const pending=deferred(),e=editor(file=>file.name==='slow.jpg'?pending.promise:Promise.resolve(result(file)));
  e.picker().props.onChoose([{name:'slow.jpg'}]);e.render();
  e.props.open=false;e.render();e.props.open=true;e.render();
  e.picker().props.onChoose([{name:'new.jpg'}]);await e.settle();
  pending.reject(Error('Old photo failed'));await e.settle();
  assert.equal(e.saveButton().props.disabled,false);
  assert.equal(e.nodes().some(n=>n.props?.role==='alert'),false);
});

test('a failed batch item stays retryable without re-saving the previous clothing',async()=>{
  let badAttempts=0;
  const e=editor(async file=>{if(file.name==='B.jpg'&&badAttempts++===0)throw Error('Decode failed');return result(file);});
  e.picker().props.onChoose(['A.jpg','B.jpg','C.jpg'].map(name=>({name})));await e.settle();
  e.saveButton().props.onClick();await e.settle();
  assert.deepEqual(e.saved,['A']);assert.equal(e.picker().props.children,null);
  assert.equal(e.saveButton().props.disabled,true);
  assert.ok(e.button('Retry photo'));assert.ok(e.button('Skip this photo'));
  e.button('Retry photo').props.onClick();await e.settle();
  e.saveButton().props.onClick();await e.settle();
  e.saveButton().props.onClick();await e.settle();
  assert.deepEqual(e.saved,['A','B','C']);assert.equal(e.closed,1);
});

test('skipping a failed batch item advances to the next photo without losing it',async()=>{
  const e=editor(async file=>{if(file.name==='B.jpg')throw Error('Unsupported photo');return result(file);});
  e.picker().props.onChoose(['A.jpg','B.jpg','C.jpg'].map(name=>({name})));await e.settle();
  e.saveButton().props.onClick();await e.settle();
  e.button('Skip this photo').props.onClick();await e.settle();
  e.saveButton().props.onClick();await e.settle();
  assert.deepEqual(e.saved,['A','C']);assert.equal(e.closed,1);
});

test('a failed cloud save preserves the same photo and remaining batch for retry',async()=>{
  const e=editor(async file=>result(file));let attempts=0;
  e.props.onSave=async piece=>{if(attempts++===0)throw Error('Connection lost');e.saved.push(piece.name);};
  e.picker().props.onChoose([{name:'A.jpg'},{name:'B.jpg'}]);await e.settle();
  const firstPhoto=e.picker().props.children.props.piece.image;
  e.saveButton().props.onClick();await e.settle();
  assert.equal(e.picker().props.children.props.piece.image,firstPhoto);
  assert.equal(e.saveButton().props.disabled,false);
  e.saveButton().props.onClick();await e.settle();
  e.saveButton().props.onClick();await e.settle();
  assert.deepEqual(e.saved,['A','B']);
});

const category=e=>e.nodes().find(n=>n.props?.label==='Category');
test('a new photo waits for recognition and saves the suggested shoe type',async()=>{
 const pending=deferred(),e=editor(async file=>result(file),()=>pending.promise);let saved;
 e.props.onSave=async piece=>{saved=piece;};
 e.picker().props.onChoose([{name:'shoe.jpg'}]);await e.settle();
 assert.equal(category(e).props.value,'');assert.equal(e.saveButton().props.disabled,true);
 pending.resolve({category:'Shoes'});await e.settle();
 assert.equal(category(e).props.value,'Shoes');
 e.saveButton().props.onClick();await e.settle();assert.equal(saved.category,'Shoes');
});
test('a manual correction wins over a late recognition result',async()=>{
 const pending=deferred(),e=editor(async file=>result(file),()=>pending.promise);
 e.picker().props.onChoose([{name:'trousers.jpg'}]);await e.settle();
 category(e).props.onChange('Bottom');pending.resolve({category:'Top'});await e.settle();
 assert.equal(category(e).props.value,'Bottom');assert.equal(e.saveButton().props.disabled,false);
});
test('a category selected during photo processing is not replaced',async()=>{
 const pending=deferred();let calls=0;
 const e=editor(()=>pending.promise,async()=>{calls++;return {category:'Top'};});
 e.picker().props.onChoose([{name:'pants.jpg'}]);category(e).props.onChange('Bottom');
 pending.resolve(result({name:'pants.jpg'}));await e.settle();
 assert.equal(category(e).props.value,'Bottom');assert.equal(calls,0);
});
test('uncertain recognition and model failure both allow manual categorization',async()=>{
 for(const recognize of [async()=>({category:null}),async()=>{throw Error('Offline');}]){
  const e=editor(async file=>result(file),recognize);
  e.picker().props.onChoose([{name:'unknown.jpg'}]);await e.settle();
  assert.equal(category(e).props.value,'');assert.equal(e.saveButton().props.disabled,true);
  category(e).props.onChange('Layer');assert.equal(e.saveButton().props.disabled,false);
 }
});
test('closing recognition cannot alter a newly opened editor',async()=>{
 const pending=deferred(),e=editor(async file=>result(file),()=>pending.promise);
 e.picker().props.onChoose([{name:'old.jpg'}]);await e.settle();
 e.props.open=false;e.render();e.props.open=true;e.render();
 pending.resolve({category:'Shoes'});await e.settle();
 assert.equal(category(e).props.value,'');assert.equal(e.saveButton().props.disabled,true);
});
test('each batch photo gets its own category and a manual edit does not carry over',async()=>{
 let calls=0;const e=editor(async file=>result(file),async()=>({category:++calls===1?'Shoes':'Bottom'}));
 const types=[];e.props.onSave=async piece=>{types.push(piece.category);};
 e.picker().props.onChoose([{name:'A.jpg'},{name:'B.jpg'}]);await e.settle();
 category(e).props.onChange('Accessory');e.saveButton().props.onClick();await e.settle();
 assert.equal(category(e).props.value,'Bottom');e.saveButton().props.onClick();await e.settle();
 assert.deepEqual(types,['Accessory','Bottom']);
});
