import {test} from 'node:test';
import assert from 'node:assert/strict';
import {colorways,matchesColorway} from '../lib/colorways.ts';
import {generateOutfit,demoPieces,defaults,type Piece,type Context,type Category} from '../lib/wardrobe.ts';
const context:Context={day:'2026-10-19',temperature:30,rain:false,occasion:'Everyday',aircon:false};
const piece=(id:string,category:Category,color:string,extra:Partial<Piece>={}):Piece=>({...demoPieces[0],id,category,color,...extra});
const generate=(pieces:Piece[],colorway='Automatic',extra:Partial<Context>={},locks:string[]=[])=>generateOutfit(pieces,[],defaults,{...context,colorway,...extra},locks,[],()=>.5);
const wardrobe=[piece('top','Top','Red'),piece('bottom','Bottom','Navy'),piece('shoe','Shoes','White')];

test('automatic generation identifies a palette covering every selected piece',()=>{
 const result=generate(wardrobe);
 assert.equal(result.items.length,3);assert.equal(result.colorway?.name,'Red accent');
 assert.ok(matchesColorway(result.items,result.colorway!));
});
test('explicit palettes never fall back to a different color scheme',()=>{
 const result=generate(wardrobe,'Earth tones');
 assert.equal(result.items.length,0);assert.match(result.reason,/Earth tones.*Try another colorway/);
 assert.equal(generate(wardrobe,'Unknown palette').items.length,0);
});
test('palette names require their defining colors, including both complementary hues',()=>{
 const white=[piece('dress','One-piece','White'),piece('shoe','Shoes','White')];
 assert.equal(generate(white,'Red accent').items.length,0);
 const blue=[piece('dress','One-piece','Blue'),white[1]];
 assert.equal(generate(blue,'Blue & orange').items.length,0);
 const complementary=[blue[0],piece('shoe','Shoes','Orange')];
 assert.equal(generate(complementary,'Blue & orange').items.length,2);
 assert.equal(generate(white,'Neutrals').items.length,2);
});
test('shoes and locked accessories must fit the palette and three-color limit',()=>{
 assert.equal(generate([...wardrobe.slice(0,2),piece('shoe','Shoes','Green')],'Red accent').items.length,0);
 const withAccessory=[...wardrobe,piece('belt','Accessory','Black')];
 assert.equal(generate(withAccessory,'Red accent',{},['belt']).items.length,0);
 const matching=[...wardrobe,piece('belt','Accessory','Red')];
 assert.equal(generate(matching,'Red accent',{},['belt']).items.length,4);
});
test('a locked piece outside a chosen palette produces actionable feedback',()=>{
 const result=generate([...wardrobe,piece('white','Top','White')],'Navy & cream',{},['top']);
 assert.equal(result.items.length,0);assert.match(result.reason,/unlock a piece/);
});
test('cold weather selects a matching layer even when the first layer clashes',()=>{
 const pieces=[...wardrobe.map(p=>({...p,warmth:2})),piece('wrong','Layer','Green',{warmth:3}),piece('right','Layer','Red',{warmth:3})];
 const result=generate(pieces,'Red accent',{temperature:12});
 assert.equal(result.items.length,4);assert.ok(result.items.some(p=>p.id==='right'));
 assert.equal(generate(pieces.filter(p=>p.id!=='right'),'Red accent',{temperature:12}).items.length,0);
});
test('a required accent may be supplied by a layer, including a locked layer in warm weather',()=>{
 const pieces=[piece('top','Top','White'),piece('bottom','Bottom','Black'),piece('shoe','Shoes','White'),piece('layer','Layer','Red')];
 assert.equal(generate(pieces,'Red accent',{aircon:true}).items.length,4);
 assert.equal(generate(pieces,'Red accent',{},['layer']).items.length,4);
});
test('large wardrobes retain rare palette colors and locked choices before limiting search',()=>{
 const pieces=[...Array.from({length:70},(_,i)=>piece('white'+i,'Top','White')),piece('red','Top','Red'),wardrobe[1],wardrobe[2]];
 const result=generate(pieces,'Red accent');
 assert.ok(result.items.some(p=>p.id==='red'));
 assert.ok(generate([...pieces,piece('grey','Bottom','Grey')],'Neutrals',{},['white69']).items.some(p=>p.id==='white69'));
});
test('palette matching still excludes laundry, archives, resting clothes and wrong occasions',()=>{
 for(const extra of [{laundry:true},{archived:true},{style:'Sport'}]){
  assert.equal(generate([{...wardrobe[0],...extra},...wardrobe.slice(1)],'Red accent',{occasion:'Office'}).items.length,0);
 }
 const result=generateOutfit(wardrobe,[{id:'wear',day:context.day,items:[wardrobe[0]],occasion:'Everyday',temperature:30}],defaults,{...context,colorway:'Red accent'});
 assert.equal(result.items.length,0);
});
test('patterns and multicolor pieces cannot slip through as extra accents',()=>{
 const print=piece('print','Top','Multicolor');
 const basics=[piece('bottom','Bottom','Beige'),piece('shoe','Shoes','White')];
 assert.equal(generate([print,...basics]).colorway?.name,'Print & neutrals');
 assert.equal(generate([print,{...basics[0],pattern:'Striped'},basics[1]]).items.length,0);
});
test('every offered palette can generate a complete look from the supported color families',()=>{
 const families=[...new Set(colorways.flatMap(p=>p.colors))];
 const all=families.flatMap((color,i)=>['Top','Bottom','Shoes','Layer'].map(category=>piece(`${i}-${category}`,category as Category,color)));
 for(const palette of colorways){
  const result=generate(all,palette.name,{aircon:true});
  assert.ok(result.items.length>=3,palette.name);
  assert.ok(result.items.some(p=>p.category==='Shoes'));
  assert.ok(result.items.some(p=>p.category==='Layer'));
  assert.ok(new Set(result.items.map(p=>p.color)).size<=3);
  assert.ok(matchesColorway(result.items,palette));
 }
});
