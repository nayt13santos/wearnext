import {test} from 'node:test';
import assert from 'node:assert/strict';
import {suggestPhotoColor} from '../lib/photo-colors.ts';

function pixels(rgb: number[], alpha=255) {
  const data=new Uint8ClampedArray(60*60*4);
  for(let i=0;i<data.length;i+=4)data.set([...rgb,alpha],i);
  return data;
}
test('photo color keeps the nearest swatch and ignores transparent background',()=>{
  assert.equal(suggestPhotoColor(pixels([49,100,185]),60,60),'Blue');
  assert.equal(suggestPhotoColor(pixels([234,235,236]),60,60),'White');
  assert.equal(suggestPhotoColor(pixels([49,100,185],0),60,60),'Grey');
});
test('photo color uses the center of the garment rather than its outside border',()=>{
  const data=pixels([235,235,235]);
  for(let y=12;y<48;y++)for(let x=12;x<48;x++)data.set([188,47,49,255],(y*60+x)*4);
  assert.equal(suggestPhotoColor(data,60,60),'Red');
});
