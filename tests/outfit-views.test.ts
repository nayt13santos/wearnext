import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canRemovePiece, outfitKey, outfitSuggestions, replacePiece, swapOptions} from '../lib/outfit-views.ts';
import {defaults, demoPieces, generateOutfit, type Context, type Piece} from '../lib/wardrobe.ts';
import {findColorway, matchesColorway} from '../lib/colorways.ts';

const context: Context = {day:'2026-11-02', temperature:30, occasion:'Everyday', rain:false, aircon:false, colorway:'Neutrals'};
const palette = findColorway('Neutrals')!;
const outfit = [demoPieces[0], demoPieces[2], demoPieces[4]];
const top = (id:string, change:Partial<Piece> = {}):Piece => ({...demoPieces[0], id, ...change});

test('sliding choices exclude laundry, archives, cooldown, unsuitable weather and clashing colors', () => {
 const candidates = [top('ready'), top('laundry',{laundry:true}), top('archived',{archived:true}), top('resting'), top('warm',{warmth:3}), top('color',{color:'Red'})];
 const wears = [{id:'w', day:'2026-11-01', items:[candidates[3]], occasion:'Everyday', temperature:30}];
 assert.deepEqual(swapOptions(candidates, wears, defaults, context, outfit, palette, 'Top').map(p=>p.id), ['ready']);
});

test('adding or replacing an accessory preserves the other categories and the colorway', () => {
 const accessory:Piece = {...top('belt'), category:'Accessory', color:'Black'};
 const next = replacePiece(outfit,'Accessory',accessory);
 assert.equal(next.length,4);assert.ok(outfit.every(p=>next.includes(p)));
 assert.ok(matchesColorway(next,palette));
 assert.deepEqual(replacePiece(next,'Accessory',null),outfit);
});

test('required body pieces, cold-weather layers and defining accent colors cannot be removed', () => {
 const layer:Piece = {...demoPieces[5],color:'Black'};
 assert.equal(canRemovePiece(outfit,'Top',palette,context),false);
 assert.equal(canRemovePiece([...outfit,layer],'Layer',palette,{...context,temperature:10}),false);
 assert.equal(canRemovePiece([...outfit,layer],'Layer',palette,context),true);
 assert.equal(canRemovePiece([...outfit,{...layer,color:'Red'}],'Layer',findColorway('Red accent')!,context),false);
});

test('suggestions are distinct, retain locks and never change wardrobe or history', () => {
 const pieces = [...outfit,top('other-top'),{...demoPieces[2],id:'other-bottom'}];
 const before = JSON.stringify(pieces);
 const suggestions = outfitSuggestions({items:outfit,colorway:palette},pieces,[],defaults,context,[outfit[0].id],()=>.5);
 assert.equal(suggestions.length,2);
 assert.equal(new Set(suggestions.map(s=>outfitKey(s.items))).size,suggestions.length);
 assert.ok(suggestions.every(s=>s.items.some(p=>p.id===outfit[0].id)&&matchesColorway(s.items,s.colorway)));
 assert.equal(JSON.stringify(pieces),before);
});

test('small wardrobes show one real suggestion rather than duplicate cards', () => {
 const first=generateOutfit(outfit,[],defaults,context,[],[],()=>.5);
 const suggestions=outfitSuggestions({items:first.items,colorway:first.colorway!},outfit,[],defaults,context,[],()=>.5);
 assert.equal(suggestions.length,1);
});
