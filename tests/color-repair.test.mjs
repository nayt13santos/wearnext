import {test} from 'node:test';
import assert from 'node:assert/strict';
import {component} from './helpers/component.mjs';
function fixture(decision,saveColor=async()=>{},photoFailure=false){
 const calls=[],piece={id:'old',name:'My shirt',color:'Grey',favorite:true,laundry:true};
 const props={open:true,onClose(){},loadPieces:async()=>[piece],saveColor:async(...args)=>{calls.push(args);await saveColor(...args);}};
 const modules={'./piece-editor':{Choice:'Choice',PiecePhoto:'PiecePhoto'},'@/lib/wardrobe':{colors:[]},'@/lib/wardrobe-photos':{savedPhotoAnalysis:async()=>{if(photoFailure)throw Error('Photo unavailable');return {colors:{}};},wardrobePhoto:async()=>new Blob()},'@/lib/category-recognition':{recognizeCategory:async()=>({attributes:{}})},'@/lib/photo-tags':{chooseColor:()=>decision}};
 return {...component('color-repair.tsx',props,modules),calls,piece};
}
test('clear color corrections save only that field and can be undone',async()=>{
 const c=fixture({color:'Blue',certain:true,reason:''});c.button('Check and repair colors').props.onClick();await c.settle();assert.deepEqual(c.calls,[['old','Grey','Blue']]);assert.equal(c.piece.favorite,true);assert.equal(c.piece.laundry,true);
 c.button('Undo correction').props.onClick();await c.settle();assert.deepEqual(c.calls[1],['old','Blue','Grey']);
});
test('uncertain photos stay unchanged until their suggested color is accepted',async()=>{
 const c=fixture({color:'Blue',certain:false,reason:'Check lighting'});c.button('Check and repair colors').props.onClick();await c.settle();assert.equal(c.calls.length,0);c.button('Save this color').props.onClick();await c.settle();assert.equal(c.calls.length,1);
});
test('already-correct colors need no write and missing photos remain retryable',async()=>{
 const same=fixture({color:'Grey',certain:true,reason:''});same.button('Check and repair colors').props.onClick();await same.settle();assert.equal(same.calls.length,0);
 const broken=fixture({},async()=>{},true);broken.button('Check and repair colors').props.onClick();await broken.settle();assert.equal(broken.calls.length,0);assert.ok(broken.button('Retry / resume (1)'));
});
test('failed corrections do not claim success and remain retryable',async()=>{
 const c=fixture({color:'Blue',certain:true,reason:''},async()=>{throw Error('Offline');});c.button('Check and repair colors').props.onClick();await c.settle();assert.ok(c.button('Retry / resume (1)'));assert.equal(c.button('Undo correction'),undefined);
});
