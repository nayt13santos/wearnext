import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import * as wardrobe from '../lib/wardrobe.ts';
import * as colorways from '../lib/colorways.ts';
import * as outfitViews from '../lib/outfit-views.ts';

const require=createRequire(import.meta.url);
const source=readFileSync(new URL('../app/studio.tsx',import.meta.url),'utf8')
 .replaceAll('import.meta.env.BASE_URL',JSON.stringify('/wearnext/'));
const compiled=ts.transpileModule(source,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,
}}).outputText;

// Exercise the actual screen callbacks and effects; browser QA covers layout.
function studio({failGeneration=false,reducedMotion=false,samples=wardrobe.demoPieces}={}){
 let index=0,dirty=false,tree;
 const hooks=[],effects=[],scrolls=[],focuses=[],pageScrolls=[];
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
 const modules={react,'./auto-upload':{default:'AutoUpload'},'./color-repair':{default:'ColorRepair'},'@/lib/outfit-views':outfitViews,'./outfit-picker':{default:'OutfitPicker'},'./outfit-suggestions':{default:'OutfitSuggestions'},'@/lib/colorways':colorways,'./piece-editor':{default:'PieceEditor',Choice:'Choice',Toggle:'Toggle',PiecePhoto:'PiecePhoto'},
  './connection-panel':{default:'ConnectionPanel'},'@/lib/client':{},'@/lib/connection':{readConnection:()=>null},
  '@/lib/wardrobe':{...wardrobe,demoPieces:samples,generateOutfit(...args){if(failGeneration)throw Error('Unexpected data');return wardrobe.generateOutfit(...args);}}};
 const exports={};
 runInNewContext(compiled,{exports,navigator:{},window:{scrollTo:options=>pageScrolls.push(options),matchMedia:()=>({matches:reducedMotion})},
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
 render();return {nodes,text,click,status,scrolls,focuses,pageScrolls};
}

test('Generate responds when no wardrobe is connected instead of being a dead button',()=>{
 const s=studio();s.click('Pick an outfit');
 assert.match(s.status(),/Connect your wardrobe/);
 assert.equal(s.scrolls.length,1);assert.equal(s.focuses.length,1);
});

test('successful generation announces the result and brings it into view',()=>{
 const s=studio();s.click('Try a sample wardrobe');s.click('Pick an outfit');
 assert.match(s.status(),/Your outfit is ready: 3 pieces selected/);
 assert.equal(s.nodes().filter(n=>n.type==='PiecePhoto').length>0,true);
 assert.equal(s.scrolls.length,1);assert.equal(s.focuses.length,1);
 assert.equal(s.scrolls[0].block,'start');
});

test('no-match feedback is visible and repeated attempts still focus the explanation',()=>{
 const s=studio({reducedMotion:true});s.click('Try a sample wardrobe');
 s.nodes().find(n=>n.type==='Choice'&&n.props.label==='Occasion').props.onChange('Formal event');
 s.click('Pick an outfit');
 assert.match(s.status(),/No complete outfit/);
 assert.equal(s.nodes().some(n=>n.props?.['aria-label']==='Example white linen shirt'),false);
 s.click('Pick an outfit');
 assert.equal(s.scrolls.length,2);assert.equal(s.scrolls[0].behavior,'instant');
 assert.equal(s.focuses.length,2);
});

test('unexpected generation failures produce an actionable error and allow retry',()=>{
 const s=studio({failGeneration:true});s.click('Try a sample wardrobe');s.click('Pick an outfit');
 assert.match(s.status(),/could not be generated.*Reload/);
 s.click('Pick an outfit');assert.equal(s.scrolls.length,2);
});

const chooseColorway=(s,value)=>s.nodes().find(n=>n.type==='Choice'&&n.props.label==='Colorway').props.onChange(value);
test('changing the colorway clears an old result and generates only the selected palette',()=>{
 const s=studio();s.click('Try a sample wardrobe');s.click('Pick an outfit');
 chooseColorway(s,'Red accent');
 assert.equal(s.status(),'');assert.equal(s.nodes().some(n=>n.props?.className==='outfit-colorway'),false);
 s.click('Pick an outfit');assert.match(s.status(),/No complete outfit.*Red accent/);
 chooseColorway(s,'Blue tonal');s.click('Pick an outfit');
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
 const s=studio({samples});s.click('Try a sample wardrobe');chooseColorway(s,'Blue & orange');s.click('Pick an outfit');
 const picker=s.nodes().find(n=>n.type==='OutfitPicker');
 const options=outfitViews.swapOptions(picker.props.pieces,picker.props.wears,picker.props.preferences,picker.props.context,picker.props.outfit,picker.props.palette,'Top');
 assert.equal(options.length,2);assert.ok(options.every(p=>p.id!=='white'));
 const originalTop=picker.props.outfit.find(p=>p.category==='Top');
 picker.props.onSelect('Top',samples.find(p=>p.id==='white'));
 assert.equal(s.nodes().find(n=>n.type==='OutfitPicker').props.outfit.find(p=>p.category==='Top').id,originalTop.id);
 picker.props.onSelect('Top',options.find(p=>p.id!==originalTop.id));
 const selected=s.nodes().filter(n=>n.type==='PiecePhoto'&&n.props.piece.id!=='white');
 assert.ok(selected.some(n=>n.props.piece.color==='Orange'));
 assert.match(s.text(s.nodes().find(n=>n.props?.className==='outfit-colorway')),/Blue & orange/);
});


test('suggestions can be dismissed and selected without recording a wear',()=>{
 const s=studio();s.click('Try a sample wardrobe');chooseColorway(s,'Blue tonal');s.click('Suggestions');
 const panel=()=>s.nodes().find(n=>n.type==='OutfitSuggestions');
 assert.ok(panel().props.suggestions.length>1);
 const first=panel().props.suggestions[0];
 panel().props.onDismiss(outfitViews.outfitKey(first.items));
 assert.ok(panel().props.suggestions.every(item=>outfitViews.outfitKey(item.items)!==outfitViews.outfitKey(first.items)));
 const chosen=panel().props.suggestions[0];panel().props.onChoose(chosen);
 assert.equal(panel(),undefined);
 const picker=s.nodes().find(n=>n.type==='OutfitPicker');
 assert.deepEqual(picker.props.outfit,chosen.items);assert.equal(picker.props.wears.length,0);
 assert.match(s.status(),/Outfit selected/);
});

test('locked pieces cannot be changed by sliders and constrain fresh suggestions',()=>{
 const s=studio();s.click('Try a sample wardrobe');s.click('Pick an outfit');
 const picker=()=>s.nodes().find(n=>n.type==='OutfitPicker');
 const top=picker().props.outfit.find(p=>p.category==='Top');
 picker().props.onLock(top);
 picker().props.onSelect('Top',wardrobe.demoPieces.find(p=>p.category==='Top'&&p.id!==top.id));
 assert.equal(picker().props.outfit.find(p=>p.category==='Top').id,top.id);
 s.click('Suggestions');
 const suggestions=s.nodes().find(n=>n.type==='OutfitSuggestions').props.suggestions;
 assert.ok(suggestions.length);assert.ok(suggestions.every(s=>s.items.some(p=>p.id===top.id)));
});

test('changing plans clears all previously generated suggestions',()=>{
 const s=studio();s.click('Try a sample wardrobe');s.click('Suggestions');
 chooseColorway(s,'Red accent');
 assert.equal(s.nodes().find(n=>n.type==='OutfitSuggestions').props.suggestions.length,0);
});


test('Add clothes opens connection settings on an unconnected device and returns to the top',()=>{
 const s=studio();s.click('Add clothes');
 assert.equal(s.nodes().find(n=>n.type==='Tabs').props.value,'settings');
 assert.equal(s.nodes().find(n=>n.type==='AutoUpload').props.open,false);
 assert.equal(s.pageScrolls.at(-1).top,0);
 const before=s.pageScrolls.length;
 s.nodes().find(n=>n.type==='Tabs').props.onValueChange('wardrobe');s.nodes();
 assert.equal(s.pageScrolls.length,before+1);
});

test('sample pieces can be edited without connecting or opening real uploads',()=>{
 const s=studio();s.click('Try a sample wardrobe');
 s.nodes().find(n=>n.props?.['aria-label']==='Edit '+wardrobe.demoPieces[0].name).props.onClick();
 const editor=s.nodes().find(n=>n.type==='PieceEditor');
 assert.equal(editor.props.open,true);
 assert.equal(editor.props.existing.id,wardrobe.demoPieces[0].id);
 assert.equal(s.nodes().find(n=>n.type==='AutoUpload').props.open,false);
});
