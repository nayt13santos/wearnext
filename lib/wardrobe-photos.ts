import {photoSource} from './client';
import {analyzePhoto,type PhotoAnalysis} from './photo';
import {similarPhoto} from './photo-similarity';
import type {Piece} from './wardrobe';

// Private image descriptors only live in memory. No photo is sent to an AI API.
const analysisCache=new Map<string,Promise<PhotoAnalysis>>();
export async function wardrobePhoto(piece:Piece):Promise<Blob>{
  if(piece.image.startsWith('blob:'))return (await fetch(piece.image)).blob();
  if(!piece.image.startsWith('wardrobe-photo:'))throw new Error('Only saved wardrobe photos can be checked.');
  const source=await photoSource(piece.id);return (await fetch(source)).blob();
}
export function savedPhotoAnalysis(piece:Piece):Promise<PhotoAnalysis>{
  const key=piece.id+':'+piece.fingerprint;let value=analysisCache.get(key);
  if(!value){value=wardrobePhoto(piece).then(analyzePhoto);analysisCache.set(key,value);value.catch(()=>analysisCache.delete(key));}return value;
}
export type DuplicateCheck={exact?:Piece;similar:Piece[];unchecked:number};
export async function checkDuplicate(photo:{fingerprint:string;analysis?:PhotoAnalysis},pieces:Piece[],signal?:AbortSignal,onProgress?:(message:string)=>void):Promise<DuplicateCheck>{
  signal?.throwIfAborted();
  const exact=pieces.find(p=>p.fingerprint&&p.fingerprint===photo.fingerprint);
  if(exact)return {exact,similar:[],unchecked:0};
  const similar:Piece[]=[];let unchecked=0;
  if(!photo.analysis)return {similar,unchecked:pieces.length};
  // Sequential downloads bound memory on iPhones; completed descriptors are reused
  // by subsequent photos in the same batch and by the color repair screen.
  for(let i=0;i<pieces.length;i++){
    signal?.throwIfAborted();const piece=pieces[i];onProgress?.(`Checking existing pieces (${i+1} of ${pieces.length})…`);
    try{const known=await savedPhotoAnalysis(piece);signal?.throwIfAborted();if(similarPhoto(photo.analysis.signature,known.signature))similar.push(piece);}catch(error){if(signal?.aborted)throw error;unchecked++;}
  }
  return {similar,unchecked};
}
