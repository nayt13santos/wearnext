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

import {analyzePhotoColors,pixelColor} from '../lib/photo-colors.ts';
function garment(bg:number[],fg:number[],narrow=false){const d=pixels(bg);for(let y=8;y<53;y++)for(let x=narrow?25:15;x<(narrow?35:45);x++)d.set([...fg,255],(y*60+x)*4);return d;}
test('a narrow dark garment is measured without its large white background',()=>{
 const result=analyzePhotoColors(garment([245,245,245],[25,26,27],true),60,60);
 assert.equal(result.color,'Black');assert.equal(result.foreground,true);assert.ok(result.confidence>.8);
});
test('pale blue, dark navy, beige and muted pink do not collapse into grey',()=>{
 assert.equal(pixelColor(172,202,221),'Blue');assert.equal(pixelColor(24,33,65),'Navy');assert.equal(pixelColor(207,188,151),'Beige');assert.equal(pixelColor(221,170,182),'Pink');
});
test('white garments remain white against contrasting dark backgrounds',()=>{
 const result=analyzePhotoColors(garment([30,30,30],[238,238,238]),60,60);
 assert.equal(result.color,'White');assert.ok(result.confidence>.8);
});
test('transparent and empty photos never claim a confident repair',()=>{
 assert.equal(analyzePhotoColors(pixels([10,10,10],0),60,60).color,null);
 assert.ok(analyzePhotoColors(pixels([250,250,250]),60,60).confidence<.6);
 assert.equal(analyzePhotoColors(new Uint8ClampedArray(),0,0).color,null);
});
test('two substantial foreground colors produce Multicolor, not background white',()=>{
 const data=garment([245,245,245],[188,47,49]);for(let y=8;y<53;y++)for(let x=30;x<45;x++)data.set([48,99,184,255],(y*60+x)*4);
 assert.equal(analyzePhotoColors(data,60,60).color,'Multicolor');
});
test('shadowed white shoes are not labeled Multicolor and olive is Green',()=>{
 const d=garment([30,30,30],[235,235,235]);for(let y=8;y<53;y++)for(let x=30;x<45;x++)d.set([175,175,175,255],(y*60+x)*4);
 const color=analyzePhotoColors(d,60,60);assert.equal(color.color,'White');assert.ok(color.confidence>.8);
 assert.equal(pixelColor(94,92,67),'Green');assert.equal(pixelColor(60,61,60),'Grey');
});

test('a white garment merging into a white background does not confidently repair to its grey shadow',()=>{
 const d=garment([250,250,250],[235,235,235]);for(let y=8;y<53;y++)for(let x=30;x<45;x++)d.set([175,175,175,255],(y*60+x)*4);
 assert.ok(analyzePhotoColors(d,60,60).confidence<.68);
});
