import {useEffect, useRef} from 'react';
import {Check, ChevronLeft, ChevronRight, LockKeyhole, LockKeyholeOpen, Minus} from 'lucide-react';
import {PiecePhoto} from './piece-editor';
import {categories, type Category, type Context, type Piece, type Preferences, type Wear} from '@/lib/wardrobe';
import {canRemovePiece, swapOptions} from '@/lib/outfit-views';
import type {Colorway} from '@/lib/colorways';

const labels: Record<Category, string> = {Top: 'Tops', Bottom: 'Bottoms', 'One-piece': 'One-pieces', Shoes: 'Shoes', Layer: 'Layers', Accessory: 'Accessories'};

export function PieceRail({category, options, selected, locked, onSelect, onLock}: {
 category: Category; options: (Piece | null)[]; selected?: Piece; locked: boolean;
 onSelect: (piece: Piece | null) => void; onLock: () => void;
}) {
 const rail = useRef<HTMLDivElement>(null);
 const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
 const selectedIndex = options.findIndex(p => (p?.id ?? null) === (selected?.id ?? null));
 const optionKey = options.map(p => p?.id ?? 'none').join('|');
 useEffect(() => {
  const node = rail.current;
  const centerSelection = () => {
   const tile = node?.children[selectedIndex] as HTMLElement | undefined;
   if (node && tile) node.scrollTo({left: tile.offsetLeft - (node.clientWidth - tile.clientWidth) / 2, behavior: 'instant'});
  };
  centerSelection();
  const resize = new ResizeObserver(centerSelection);
  if (node) resize.observe(node);
  return () => { clearTimeout(timer.current); resize.disconnect(); };
 }, [selectedIndex, optionKey]);
 useEffect(() => () => clearTimeout(timer.current), [locked, onSelect]);
 function scrollSettled() {
  clearTimeout(timer.current);
  if (locked) return;
  timer.current = setTimeout(() => {
   const node = rail.current;
   if (!node) return;
   const center = node.scrollLeft + node.clientWidth / 2;
   let nearest = 0, distance = Infinity;
   Array.from(node.children).forEach((child, index) => {
    const tile = child as HTMLElement;
    const delta = Math.abs(tile.offsetLeft + tile.clientWidth / 2 - center);
    if (delta < distance) { distance = delta; nearest = index; }
   });
   if (nearest !== selectedIndex && options[nearest] !== undefined) onSelect(options[nearest]);
  }, 160);
 }
 const move = (direction: number) => {
  const next = selectedIndex + direction;
  if (!locked && next >= 0 && next < options.length) onSelect(options[next]);
 };
 return <section className={'piece-rail' + (locked ? ' is-locked' : '')} aria-label={labels[category]}>
  <div className="rail-heading"><h3>{labels[category]}</h3><div className="rail-controls">
   {selected && <button className={'icon-button ' + (locked ? 'locked' : '')} onClick={onLock} aria-label={(locked ? 'Unlock ' : 'Lock ') + selected.name} title={locked ? 'Unlock to change this piece' : 'Keep this piece'}>{locked ? <LockKeyhole size={16}/> : <LockKeyholeOpen size={16}/>}</button>}
   <button className="icon-button" aria-label={'Previous ' + category.toLowerCase()} disabled={locked || selectedIndex <= 0} onClick={() => move(-1)}><ChevronLeft size={18}/></button>
   <button className="icon-button" aria-label={'Next ' + category.toLowerCase()} disabled={locked || selectedIndex >= options.length - 1} onClick={() => move(1)}><ChevronRight size={18}/></button>
  </div></div>
  <div className="piece-track" id={'piece-track-' + category} ref={rail} onScroll={scrollSettled} role="group" aria-label={'Slide to choose ' + category.toLowerCase()} tabIndex={0} onKeyDown={event => {
   if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1); }
  }}>
   {options.map((piece, index) => <button key={piece?.id ?? 'none'} className={'piece-option' + (index === selectedIndex ? ' is-selected' : '')} aria-pressed={index === selectedIndex} aria-label={piece?.name ?? 'No ' + category.toLowerCase()} disabled={locked} onClick={() => onSelect(piece)}>
    {piece ? <PiecePhoto piece={piece}/> : <span className="no-piece"><Minus size={24}/><span>None</span></span>}
    {index === selectedIndex && <span className="selection-check"><Check size={12}/></span>}
   </button>)}
  </div>
  <p className="rail-caption" aria-live="polite"><strong>{selected?.name ?? 'No ' + category.toLowerCase()}</strong><span>{locked ? 'Kept in this outfit' : options.length > 1 ? `${selectedIndex + 1} of ${options.length} · Swipe or use arrows` : 'Only matching piece'}</span></p>
 </section>;
}

export default function OutfitPicker({pieces, wears, preferences, context, outfit, palette, locks, onSelect, onLock}: {
 pieces: Piece[]; wears: Wear[]; preferences: Preferences; context: Context; outfit: Piece[]; palette: Colorway; locks: string[];
 onSelect: (category: Category, piece: Piece | null) => void; onLock: (piece: Piece) => void;
}) {
 return <div className="outfit-picker" role="group" aria-label="Build your outfit"><h2 className="sr-only">Slide to build your outfit</h2>
  {categories.map(category => {
   const selected = outfit.find(p => p.category === category);
   if (!selected && category !== 'Layer' && category !== 'Accessory') return null;
   const choices = swapOptions(pieces, wears, preferences, context, outfit, palette, category);
   if (!selected && !choices.length) return null;
   const options = canRemovePiece(outfit, category, palette, context) ? [null, ...choices] : choices;
   return <PieceRail key={category} category={category} options={options} selected={selected} locked={!!selected && locks.includes(selected.id)} onSelect={piece => onSelect(category, piece)} onLock={() => selected && onLock(selected)}/>;
  })}
 </div>;
}
