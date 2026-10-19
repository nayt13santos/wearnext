import {test} from 'node:test';
import assert from 'node:assert/strict';
import {suggestCategory} from '../lib/category-rules.ts';
const labels=[{category:'Top',label:'shirt'},{category:'Top',label:'tee'},{category:'Bottom',label:'trousers'},{category:'Shoes',label:'sneakers'},{category:'Layer',label:'jacket'},{category:'Unknown',label:'household object'}];
test('clear photographic matches select tops, bottoms, and shoes',()=>{
 assert.equal(suggestCategory([.32,.31,.20,.19,.27,.18],labels).category,'Top');
 assert.equal(suggestCategory([.22,.20,.33,.22,.24,.23],labels).category,'Bottom');
 assert.equal(suggestCategory([.21,.20,.23,.31,.24,.23],labels).category,'Shoes');
});
test('uncertain shirt versus layer, unknown objects, and weak matches need manual input',()=>{
 assert.equal(suggestCategory([.337,.25,.267,.23,.341,.269],labels).category,null);
 assert.equal(suggestCategory([.2,.21,.22,.19,.18,.35],labels).category,null);
 assert.equal(suggestCategory([.20,.19,.11,.10,.11,.1],labels).category,null);
});
test('invalid model output never produces an automatic category',()=>{
 assert.equal(suggestCategory([],labels).category,null);
 assert.equal(suggestCategory([NaN,.3,.1,.1,.1,.1],labels).category,null);
 assert.equal(suggestCategory([Infinity,.3,.1,.1,.1,.1],labels).category,null);
});
test('adding repeated labels does not bias category selection',()=>{
 const original=suggestCategory([.32,.31,.20,.19,.27,.18],labels);
 const expanded=suggestCategory([.32,.31,.20,.19,.27,.18,.31], [...labels,{category:'Top',label:'another shirt'}]);
 assert.deepEqual(expanded,original);
});
