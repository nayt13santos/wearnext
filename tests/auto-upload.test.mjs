import {test} from 'node:test';
import assert from 'node:assert/strict';
import {component} from './helpers/component.mjs';
function fixture(overrides={}){
 const saved=[],photos=[],checks=[];let closed=0;
 const props={open:true,onClose:()=>closed++,loadPieces:async()=>[],onSave:async(piece,photo)=>{saved.push({piece,photo});return {...piece,id:piece.name};},...overrides.props};
 const modules={'./photo-picker':{default:'PhotoPicker'},'./piece-editor':{Choice:'Choice',PiecePhoto:'PiecePhoto',Toggle:'Toggle'},'@/lib/wardrobe':{categories:[],colors:[]},
 '@/lib/photo':{processPhoto:async file=>{const p={url:'blob:'+file.name,fingerprint:file.name,original:new Blob(),analysis:{colors:{}}};photos.push(p);return p;},...overrides.photo},
 '@/lib/category-recognition':{recognizeCategory:async()=>({})},'@/lib/photo-tags':{pieceFromPhoto:(_,colors,image,fingerprint)=>({piece:{name:fingerprint,category:'Top',color:'Blue',warmth:1,image,fingerprint},review:[]}),...overrides.tags},
 '@/lib/wardrobe-photos':{checkDuplicate:async(photo,pieces)=>{checks.push([...pieces]);return {similar:[],unchecked:0};},...overrides.duplicates}};
 const c=component('auto-upload.tsx',props,modules);return {...c,saved,photos,checks,choose:files=>c.nodes().find(n=>n.type==='PhotoPicker').props.onChoose(files.map(name=>({name}))),get closed(){return closed;}};
}
test('batch photos are tagged and saved without a Save click; later checks include earlier saves',async()=>{
 const c=fixture();c.choose(['a.jpg','b.jpg']);await c.settle();assert.equal(c.saved.length,2);assert.equal(c.checks[1][0].id,'a.jpg');assert.ok(c.button('Done'));
});
test('exact duplicates, including archived pieces, are skipped without another save',async()=>{
 const c=fixture({duplicates:{checkDuplicate:async()=>({exact:{id:'old',name:'Old tee',archived:true},similar:[],unchecked:0})}});c.choose(['a.jpg']);await c.settle();assert.equal(c.saved.length,0);assert.match(c.nodes().map(c.text).join(' '),/Already saved as Old tee/);
});
test('a possible match never saves or deletes either garment without a decision',async()=>{
 const c=fixture({duplicates:{checkDuplicate:async()=>({similar:[{id:'old',name:'Another tee'}],unchecked:0})}});c.choose(['a.jpg']);await c.settle();assert.equal(c.saved.length,0);c.button('Save as a separate piece').props.onClick();await c.settle();assert.equal(c.saved.length,1);
});
test('uncertain fields require a choice instead of silently saving a default Top or Solid',async()=>{
 const c=fixture({tags:{pieceFromPhoto:()=>({piece:{name:'Unknown clothing',category:'Top',color:'Blue',warmth:1},review:['Category','Pattern']})}});c.choose(['a.jpg']);await c.settle();assert.equal(c.saved.length,0);assert.equal(c.button('Save clothing').props.disabled,true);
 for(const [label,value] of [['Category','Shoes'],['Pattern','Solid']])c.nodes().find(n=>n.type==='Choice'&&n.props.label===label).props.onChange(value);
 c.button('Save clothing').props.onClick();await c.settle();assert.equal(c.saved[0].piece.category,'Shoes');
});
test('one decoding failure does not drop the rest of a batch',async()=>{
 const c=fixture({photo:{processPhoto:async file=>{if(file.name==='a.jpg')throw Error('Bad image');return {url:'blob:b',fingerprint:'b',original:new Blob(),analysis:{colors:{}}};}}});c.choose(['a.jpg','b.jpg']);await c.settle();assert.equal(c.saved.length,1);assert.ok(c.button('Retry / resume (1)'));
});
test('retry after a failed cloud save reuses the same photo and operation identity',async()=>{
 const attempted=[];const c=fixture({props:{onSave:async(piece,photo)=>{attempted.push(photo);if(attempted.length===1)throw Error('Connection lost');return {...piece,id:'saved'};}}});c.choose(['a.jpg']);await c.settle();c.button('Retry / resume (1)').props.onClick();await c.settle();assert.equal(attempted[0],attempted[1]);assert.equal(c.photos.length,1);
});
test('wardrobe connection failure preserves the selected files for retry',async()=>{
 let attempts=0;const c=fixture({props:{loadPieces:async()=>{if(!attempts++)throw Error('Offline');return [];}}});c.choose(['a.jpg']);await c.settle();assert.ok(c.button('Retry / resume (1)'));c.button('Retry / resume (1)').props.onClick();await c.settle();assert.equal(c.saved.length,1);
});
