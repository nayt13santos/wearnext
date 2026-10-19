import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import * as wardrobe from '../lib/wardrobe.ts';
import * as colorways from '../lib/colorways.ts';

const require=createRequire(import.meta.url);
const source=readFileSync(new URL('../app/studio.tsx',import.meta.url),'utf8')
 .replaceAll('import.meta.env.BASE_URL',JSON.stringify('/wearnext/'));
const compiled=ts.transpileModule(source,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,
}}).outputText;

// Exercise the actual screen callbacks and effects; browser QA covers layout.
function studio({failGeneration=false,reducedMotion=false,samples=wardrobe.demoPieces}={}){
 let index=0,dirty=false,tree;
 const hooks=[],effects=[],scrolls=[],focuses=[];
 const board={focus:options=>focuses.push(options),scrollIntoView:options=>scrolls.push(options)};
 const react={...require('react'),useState(initial){
  const i=index++;hooks[i]??={value:typeof initial==='function'?initial():initial};
  return [hooks[i].value,next=>{const value=typeof next==='function'?next(hooks[i].value):next;
   if(!Object.is(value,hooks[i].value)){hooks[i].value=value;dirty=true;}}];
 },useRef(initial){const i=index++;hooks[i]??={current:initial};return hooks[i];},
 useMemo:fn=>fn(),useEffect(callback,deps){const i=index++,old=hooks[i];
  if(!old||deps.some((d,j)=>!Object.is(d,old.deps[j])))effects.push(()=>{
   old?.cleanup?.();hooks[i]={deps,cleanup:callback()};
  });
 }};
 const modules={react,'@/lib/colorways':colorways,'./piece-editor':{default:'PieceEditor',Choice:'Choice',Toggle:'Toggle',PiecePhoto:'PiecePhoto'},
  './connection-panel':{default:'ConnectionPanel'},'@/lib/client':{},'@/lib/connection':{readConnection:()=>null},
  '@/lib/wardrobe':{...wardrobe,demoPieces:samples,generateOutfit(...args){if(failGeneration)throw Error('Unexpected data');return wardrobe.generateOutfit(...args);}}};
 const exports={};
 runInNewContext(compiled,{exports,navigator:{},window:{matchMedia:()=>({matches:reducedMotion})},
  require:id=>modules[id]||(id.startsWith('@/components/')?new Proxy({}, {get:(_,key)=>String(key)}):require(id))});
 function visit(node,found=[]){if(Array.isArray(node)){node.forEach(n=>visit(n,found));return found;}
  if(!node||typeof node!=='object')return found;found.push(node);visit(node.props?.children,found);return found;}
 function render(){let count=0;do{dirty=false;index=0;tree=exports.default();
  visit(tree).forEach(n=>{if(n.props?.id==='outfit-result'&&n.props.ref)n.props.ref.current=board;});
  effects.splice(0).forEach(fn=>fn());if(++count>20)throw Error('Render loop');
 }while(dirty);return tree;}
 function text(node){if(Array.isArray(node))return node.map(text).join('');
  if(node===null||node===undefined||typeof node==='boolean')return '';
  return typeof node==='object'?text(node.props?.children):String(node);}
 const nodes=()=>visit(render());
 const button=label=>nodes().find(n=>n.type==='button'&&text(n).trim()===label);
 const click=label=>{const b=button(label);assert.ok(b,`Button exists: ${label}`);assert.ok(!b.props.disabled);b.props.onClick();render();};
 const status=()=>text(nodes().find(n=>n.props?.role==='status'));
 render();return {nodes,text,click,status,scrolls,focuses};
}

test('Generate responds when no wardrobe is connected instead of being a dead button',()=>{
 const s=studio();s.click('Generate my outfit');
 assert.match(s.status(),/Connect your wardrobe/);
 assert.equal(s.scrolls.length,1);assert.equal(s.focuses.length,1);
});

test('successful generation announces the result and brings it into view',()=>{
 const s=studio();s.click('Try a sample wardrobe');s.click('Generate my outfit');
 assert.match(s.status(),/Your outfit is ready: 3 pieces selected/);
 assert.equal(s.nodes().filter(n=>n.type==='PiecePhoto').length>0,true);
 assert.equal(s.scrolls.length,1);assert.equal(s.focuses.length,1);
 assert.equal(s.scrolls[0].block,'start');
});

test('no-match feedback is visible and repeated attempts still focus the explanation',()=>{
 const s=studio({reducedMotion:true});s.click('Try a sample wardrobe');
 s.nodes().find(n=>n.type==='Choice'&&n.props.label==='Where are you headed?').props.onChange('Formal event');
 s.click('Generate my outfit');
 assert.match(s.status(),/No complete outfit/);
 assert.equal(s.nodes().some(n=>n.props?.['aria-label']==='Example white linen shirt'),false);
 s.click('Generate my outfit');
 assert.equal(s.scrolls.length,2);assert.equal(s.scrolls[0].behavior,'instant');
 assert.equal(s.focuses.length,2);
});

test('unexpected generation failures produce an actionable error and allow retry',()=>{
 const s=studio({failGeneration:true});s.click('Try a sample wardrobe');s.click('Generate my outfit');
 assert.match(s.status(),/could not be generated.*Reload/);
 s.click('Generate my outfit');assert.equal(s.scrolls.length,2);
});

const chooseColorway=(s,value)=>s.nodes().find(n=>n.type==='Choice'&&n.props.label==='Colorway').props.onChange(value);
test('changing the colorway clears an old result and generates only the selected palette',()=>{
 const s=studio();s.click('Try a sample wardrobe');s.click('Generate my outfit');
 chooseColorway(s,'Red accent');
 assert.equal(s.status(),'');assert.equal(s.nodes().some(n=>n.props?.className==='outfit-colorway'),false);
 s.click('Generate my outfit');assert.match(s.status(),/No complete outfit.*Red accent/);
 chooseColorway(s,'Blue tonal');s.click('Generate my outfit');
 assert.match(s.status(),/Blue tonal colorway/);
 assert.equal(s.text(s.nodes().find(n=>n.props?.className==='outfit-colorway')).includes('Blue tonal'),true);
});

test('visible swaps preserve both defining complementary colors',()=>{
 const samples=[
  {...wardrobe.demoPieces[0],id:'blue',name:'Blue top',color:'Blue'},
  {...wardrobe.demoPieces[0],id:'navy',name:'Navy top',color:'Navy'},
  {...wardrobe.demoPieces[0],id:'white',name:'White top',color:'White'},
  {...wardrobe.demoPieces[2],id:'orange',color:'Orange'},wardrobe.demoPieces[4],
 ];
 const s=studio({samples});s.click('Try a sample wardrobe');chooseColorway(s,'Blue & orange');s.click('Generate my outfit');
 const alternatives=s.nodes().filter(n=>n.props?.className==='alternative');
 assert.equal(alternatives.length,1);assert.doesNotMatch(s.text(alternatives),/White top/);
 alternatives[0].props.onClick();
 const selected=s.nodes().filter(n=>n.type==='PiecePhoto'&&n.props.piece.id!=='white');
 assert.ok(selected.some(n=>n.props.piece.color==='Orange'));
 assert.match(s.text(s.nodes().find(n=>n.props?.className==='outfit-colorway')),/Blue & orange/);
});
