import {ArrowRight, X} from 'lucide-react';
import {PiecePhoto} from './piece-editor';
import {outfitKey, type OutfitSuggestion} from '@/lib/outfit-views';

export default function OutfitSuggestions({suggestions, occasion, onChoose, onDismiss, onGenerate}: {
 suggestions: OutfitSuggestion[]; occasion: string; onChoose: (suggestion: OutfitSuggestion) => void;
 onDismiss: (key: string) => void; onGenerate: () => void;
}) {
 return <section className="suggestions-view" aria-label="Outfit suggestions">
  <div className="suggestions-heading"><div><h2>Choose your look</h2><p>From your wardrobe for {occasion.toLowerCase()}.</p></div><button className="quiet" onClick={onGenerate}>Refresh looks</button></div>
  {suggestions.length ? <><div className="suggestion-grid">{suggestions.map((suggestion, index) => <article className="suggestion-card" key={outfitKey(suggestion.items)}>
   <div className="suggestion-card-heading"><span>Look {index + 1}</span><button className="icon-button" aria-label={'Dismiss look ' + (index + 1)} onClick={() => onDismiss(outfitKey(suggestion.items))}><X size={17}/></button></div>
   <div className="suggestion-collage">{suggestion.items.map(piece => <div key={piece.id} className={'suggestion-piece category-' + piece.category.toLowerCase()}><PiecePhoto piece={piece}/></div>)}</div>
   <div className="suggestion-details"><h3>{suggestion.colorway.name}</h3><p>{suggestion.items.map(p => p.name).join(', ')}</p><button className="secondary full" onClick={() => onChoose(suggestion)}>Use this outfit <ArrowRight size={17}/></button></div>
  </article>)}</div>{suggestions.length < 3 && <p className="suggestion-note">Showing {suggestions.length} distinct {suggestions.length === 1 ? 'look' : 'looks'}. Try another colorway or unlock a piece for more options.</p>}</> : <div className="suggestions-empty"><h3>No looks to show yet</h3><p>Generate outfits for your plans, or refresh to bring dismissed looks back.</p><button className="secondary" onClick={onGenerate}>Find outfit suggestions</button></div>}
 </section>;
}
