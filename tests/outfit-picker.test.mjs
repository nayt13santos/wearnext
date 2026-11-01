import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import * as wardrobe from '../lib/wardrobe.ts';
import * as views from '../lib/outfit-views.ts';

const require=createRequire(import.meta.url);
const compiled=ts.transpileModule(readFileSync(new URL('../app/outfit-picker.tsx',import.meta.url),'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022},
}).outputText;

function rail({locked=false,none=false}={}) {
 const effects=[],cleanups=[],timers=new Map(),chosen=[];
 let timerId=0,resize;
 const modules={react:{...require('react'),useRef:initial=>({current:initial}),useEffect:fn=>effects.push(fn)},
  './piece-editor':{PiecePhoto:'PiecePhoto'},'@/lib/wardrobe':wardrobe,'@/lib/outfit-views':views};
 const exports={};
 runInNewContext(compiled,{exports,require:id=>modules[id]||require(id),
  setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),
  ResizeObserver:class {constructor(callback){resize=callback;}observe(){}disconnect(){}},
 });
 const options=none?[null,wardrobe.demoPieces[0]]:wardrobe.demoPieces.slice(0,2);
 const tree=exports.PieceRail({category:'Top',options,selected:options[1],locked,onSelect:p=>chosen.push(p),onLock:()=>{}});
 const nodes=[];
 function visit(n){if(Array.isArray(n))return n.forEach(visit);if(!n||typeof n!=='object')return;nodes.push(n);visit(n.props?.children);}
 visit(tree);
 const track=nodes.find(n=>n.props?.className==='piece-track');
 const node={offsetLeft:831,clientWidth:354,scrollLeft:0,children:[{offsetLeft:121,clientWidth:112},{offsetLeft:245,clientWidth:112}],scrollTo({left}){this.scrollLeft=left;}};
 track.props.ref.current=node;effects.forEach(fn=>cleanups.push(fn()));
 return {node,chosen,resize,track,scroll(left){node.scrollLeft=left;track.props.onScroll();},settle(){const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());},unmount(){cleanups.forEach(fn=>fn?.());}};
}

test('selected tiles center using track-relative offsets, including after resizing',()=>{
 const r=rail();assert.equal(r.node.scrollLeft,124);
 r.node.clientWidth=240;r.node.children[1].offsetLeft=176;r.resize();
 assert.equal(r.node.scrollLeft,112);
});

test('a settled swipe selects the nearest piece and can select None',()=>{
 const r=rail();r.scroll(70);r.scroll(0);r.settle();
 assert.equal(r.chosen.length,1);assert.equal(r.chosen[0].id,wardrobe.demoPieces[0].id);
 const optional=rail({none:true});optional.scroll(0);optional.settle();assert.deepEqual(optional.chosen,[null]);
});

test('locked rails and unmounted views cannot apply delayed swipe selections',()=>{
 const locked=rail({locked:true});locked.scroll(0);locked.settle();assert.equal(locked.chosen.length,0);
 const r=rail();r.scroll(0);r.unmount();r.settle();assert.equal(r.chosen.length,0);
});
