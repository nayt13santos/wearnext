import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chooseColor,pieceFromPhoto,recognizeTags} from '../lib/photo-tags.ts';
import type {PhotoColors} from '../lib/photo-colors.ts';
const pixels:PhotoColors={color:'Blue',confidence:.9,foreground:true,palette:[{color:'Blue',share:.95}],bounds:{x:0,y:0,width:100,height:100}};
test('strong foreground color can repair a tag, but conflicting visual evidence needs review',()=>{
 assert.equal(chooseColor(pixels).certain,true);
 assert.equal(chooseColor(pixels,{value:'White',score:.3,margin:.05,confident:true}).certain,false);
 assert.equal(chooseColor({...pixels,foreground:false,confidence:.5}).certain,false);
});
test('independent attribute groups and margins do not treat similarities as probabilities',()=>{
 const result=recognizeTags([.33,.19,.31,.30,.28,.22],[{category:'Top',label:'a t-shirt'},{category:'Unknown',label:'food'}],[{field:'material',value:'Cotton',label:''},{field:'material',value:'Linen',label:''},{field:'pattern',value:'Striped',label:''},{field:'pattern',value:'Solid',label:''}]);
 assert.equal(result.category,'Top');assert.equal(result.attributes!.material.confident,false);assert.equal(result.attributes!.pattern.value,'Striped');assert.equal(result.attributes!.pattern.confident,true);
});
test('unclear fabric is Other and rain protection is never invented from a photo',()=>{
 const result=pieceFromPhoto({category:'Top',confidence:.9,label:'a t-shirt',attributes:{pattern:{value:'Striped',score:.4,margin:.1,confident:true}}},pixels,'blob:test','hash');
 assert.equal(result.piece.name,'Blue striped t-shirt');assert.equal(result.piece.material,'Other');assert.equal(result.piece.waterproof,false);assert.deepEqual(result.review,[]);
});
test('uncertain category, color and pattern must be reviewed before automatic saving',()=>{
 const result=pieceFromPhoto({category:null,confidence:.2,label:'food'},{...pixels,foreground:false,confidence:.3},'blob:test','hash');
 assert.deepEqual(result.review,['Category','Color','Pattern']);assert.equal(result.piece.name.includes('food'),false);
});
test('malformed attribute scores never produce confident tags',()=>{
 const result=recognizeTags([NaN],[{category:'Top',label:'shirt'}],[{field:'color',value:'Blue',label:''}]);
 assert.equal(result.category,null);assert.deepEqual(result.attributes,{});
});
