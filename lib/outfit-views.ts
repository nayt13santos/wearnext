import {availability, generateOutfit, suitable, type Category, type Context, type Piece, type Preferences, type Wear} from './wardrobe.ts';
import {matchesColorway, type Colorway} from './colorways.ts';

export type OutfitSuggestion = {items: Piece[]; colorway: Colorway};
export const outfitKey = (items: Piece[]) => items.map(p => p.id).sort().join('|');

export function replacePiece(items: Piece[], category: Category, replacement: Piece | null) {
 const next = items.filter(p => p.category !== category);
 return replacement ? [...next, replacement] : next;
}

export function swapOptions(pieces: Piece[], wears: Wear[], preferences: Preferences, context: Context, items: Piece[], palette: Colorway, category: Category) {
 return pieces.filter(p => p.category === category
  && availability(p, wears, context.day, preferences.cooldown) === 'Available'
  && suitable(p, context)
  && matchesColorway(replacePiece(items, category, p), palette));
}

export function canRemovePiece(items: Piece[], category: Category, palette: Colorway, context: Context) {
 return (category === 'Accessory' || (category === 'Layer' && context.temperature >= 18))
  && matchesColorway(replacePiece(items, category, null), palette);
}

// Keep generation bounded, then fill any duplicate results with valid single-piece swaps.
export function outfitSuggestions(first: OutfitSuggestion, pieces: Piece[], wears: Wear[], preferences: Preferences, context: Context, locks: string[] = [], random = Math.random) {
 const suggestions = [first];
 const seen = new Set([outfitKey(first.items)]);
 const add = (suggestion: OutfitSuggestion) => {
  const key = outfitKey(suggestion.items);
  if (!seen.has(key)) { seen.add(key); suggestions.push(suggestion); }
 };
 for (let attempt = 0; attempt < 2; attempt++) {
  const result = generateOutfit(pieces, wears, preferences, context, locks, suggestions.flatMap(s => s.items.map(p => p.id)), random);
  if (result.items.length && result.colorway) add({items: result.items, colorway: result.colorway});
 }
 for (const suggestion of [...suggestions]) {
  for (const current of suggestion.items) {
   if (locks.includes(current.id)) continue;
   for (const piece of swapOptions(pieces, wears, preferences, context, suggestion.items, suggestion.colorway, current.category)) {
    if (suggestions.length >= 3) return suggestions;
    add({items: replacePiece(suggestion.items, current.category, piece), colorway: suggestion.colorway});
   }
  }
 }
 return suggestions;
}
