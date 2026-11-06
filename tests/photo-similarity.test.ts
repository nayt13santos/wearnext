import {test} from 'node:test';
import assert from 'node:assert/strict';
import {photoSignature,similarPhoto} from '../lib/photo-similarity.ts';
function photo(scale=1,blue=false){const size=32*scale,d=new Uint8ClampedArray(size*size*4);for(let y=0;y<size;y++)for(let x=0;x<size;x++){const shade=x>size/4&&x<size*.75&&y>size/8&&y<size*.9?70:240;d.set(blue?[shade,shade,Math.min(255,shade+110),255]:[shade,shade,shade,255],(y*size+x)*4);}return photoSignature(d,size,size);}
test('resized copies are a possible visual match',()=>assert.equal(similarPhoto(photo(),photo(3)),true));
test('different garment colors are not treated as duplicates',()=>assert.equal(similarPhoto(photo(),photo(1,true)),false));
test('flat fields and invalid descriptors never imply an identical piece',()=>{
 const flat=photoSignature(new Uint8ClampedArray(32*32*4).fill(255),32,32);assert.equal(similarPhoto(flat,flat),false);
 assert.equal(similarPhoto({...photo(),hash:''},photo()),false);
});
