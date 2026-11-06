import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url);
export function component(file,props,modules){
 const source=readFileSync(new URL('../../app/'+file,import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 let index=0,dirty=false,tree;const hooks=[],effects=[],revoked=[];
 const react={...require('react'),useState(initial){const i=index++;hooks[i]??={value:typeof initial==='function'?initial():initial};return [hooks[i].value,next=>{const value=typeof next==='function'?next(hooks[i].value):next;if(!Object.is(value,hooks[i].value)){hooks[i].value=value;dirty=true;}}];},useRef(initial){const i=index++;hooks[i]??={current:initial};return hooks[i];},useEffect(callback,deps){const i=index++,old=hooks[i];if(!old||deps.some((d,j)=>!Object.is(d,old.deps[j])))effects.push(()=>{old?.cleanup?.();hooks[i]={deps,cleanup:callback()};});}};
 const exports={};runInNewContext(compiled,{exports,AbortController,URL:{revokeObjectURL:url=>revoked.push(url)},require:id=>id==='react'?react:modules[id]||(id.startsWith('@/components/')?new Proxy({},{get:(_,key)=>String(key)}):require(id))});
 function render(){let count=0;do{dirty=false;index=0;tree=exports.default(props);effects.splice(0).forEach(f=>f());if(++count>30)throw Error('Render loop');}while(dirty);return tree;}
 function text(n){if(Array.isArray(n))return n.map(text).join('');if(n==null||typeof n==='boolean')return '';return typeof n==='object'?text(n.props?.children):String(n);}
 function nodes(){render();const result=[];function visit(n){if(Array.isArray(n)){n.forEach(visit);return;}if(!n||typeof n!=='object')return;result.push(n);visit(n.props?.children);}visit(tree);return result;}
 const settle=async()=>{await new Promise(r=>setImmediate(r));render();};render();
 return {props,render,nodes,text,settle,revoked,button:label=>nodes().find(n=>n.type==='button'&&text(n)===label)};
}
