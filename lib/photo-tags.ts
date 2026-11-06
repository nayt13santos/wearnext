import {suggestCategory,type CategoryLabel,type CategorySuggestion} from './category-rules.ts';
import type {PhotoColors} from './photo-colors.ts';
import type {Piece} from './wardrobe.ts';

export type AttributeLabel={field:string;value:string;label:string};
export type AttributeSuggestion={value:string;score:number;margin:number;confident:boolean};
export type ClothingRecognition=CategorySuggestion & {attributes?:Record<string,AttributeSuggestion>;embedding?:number[]};
export function recognizeTags(scores:ArrayLike<number>,categories:CategoryLabel[],labels:AttributeLabel[]):ClothingRecognition {
  const category=suggestCategory(Array.from(scores).slice(0,categories.length),categories);
  const attributes:Record<string,AttributeSuggestion>={};
  if(scores.length!==categories.length+labels.length||Array.from(scores).some(s=>!Number.isFinite(s)))return {...category,attributes};
  for(const field of new Set(labels.map(l=>l.field))){
    const ranked=labels.map((label,i)=>({...label,score:scores[categories.length+i]})).filter(l=>l.field===field).sort((a,b)=>b.score-a.score);
    const best=ranked[0],margin=best.score-(ranked[1]?.score??best.score);
    attributes[field]={value:best.value,score:best.score,margin,confident:best.score>=.20&&margin>=(field==='material'?.035:field==='color'?.025:.018)};
  }
  return {...category,attributes};
}
export type ColorDecision={color:string|null;certain:boolean;reason:string};
export function chooseColor(pixels:PhotoColors,semantic?:AttributeSuggestion):ColorDecision {
  const visual=semantic?.confident?semantic.value:null;
  if(pixels.color&&pixels.foreground&&pixels.confidence>=.68){
    if(visual&&visual!==pixels.color)return {color:pixels.color,certain:false,reason:'Lighting or more than one color makes this uncertain.'};
    return {color:pixels.color,certain:true,reason:'Color detected from the clothing, with the border background excluded.'};
  }
  if(visual&&pixels.color===visual&&pixels.confidence>=.38)return {color:visual,certain:true,reason:'Image recognition and the photo colors agree.'};
  return {color:visual||pixels.color,certain:false,reason:'Please check the color against the photo.'};
}
export function pieceFromPhoto(recognition:ClothingRecognition,pixels:PhotoColors,image:string,fingerprint:string):{piece:Piece;review:string[]} {
  const attrs=recognition.attributes||{},color=chooseColor(pixels,attrs.color);
  const review:string[]=[];
  if(!recognition.category)review.push('Category');if(!color.certain)review.push('Color');
  const type=recognition.category?recognition.label.replace(/^(a|an) /,''):'';
  const estimated=(field:string,fallback:string)=>attrs[field]?.confident?attrs[field].value:fallback;
  const pattern=estimated('pattern','Solid');
  // A photo cannot verify fabric composition or waterproofing. Other explicitly
  // means unknown; rain protection stays unconfirmed until the owner changes it.
  const material=estimated('material','Other');
  const style=estimated('style',/sports|jersey|leggings|jogger/.test(type)?'Sport':/blazer|dress shoes|loafers|button-up|chino/.test(type)?'Smart':'Casual');
  const warmth=Number(estimated('warmth',/coat|sweater|sweatshirt|hoodie/.test(type)?'3':/jacket|blazer|cardigan|jeans/.test(type)?'2':'1'));
  if(!attrs.pattern?.confident)review.push('Pattern');
  const name=[color.color,pattern!=='Solid'?pattern.toLowerCase():'',type||'clothing'].filter(Boolean).join(' ');
  return {piece:{id:'',name,category:recognition.category||'Top',color:color.color||'Grey',pattern,material,style,warmth,waterproof:false,laundry:false,archived:false,favorite:false,image,fingerprint},review};
}
