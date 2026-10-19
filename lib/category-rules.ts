import {categories,type Piece} from './wardrobe.ts';
export type CategorySuggestion={category:Piece['category']|null;confidence:number;label:string};
export type CategoryLabel={category:string;label:string};

// CLIP similarities are not calibrated probabilities. Compare each category's
// best label so a longer vocabulary does not give that category an advantage.
export function suggestCategory(scores:ArrayLike<number>,labels:readonly CategoryLabel[]):CategorySuggestion{
 const unknown:CategorySuggestion={category:null,confidence:0,label:''};
 if(scores.length!==labels.length||!labels.length)return unknown;
 const groups=new Map<string,{score:number;label:string}>();
 for(let i=0;i<labels.length;i++){
  const score=scores[i],{category,label}=labels[i];if(!Number.isFinite(score))return unknown;
  if(score>(groups.get(category)?.score??-Infinity))groups.set(category,{score,label});
 }
 const ranked=[...groups].sort((a,b)=>b[1].score-a[1].score);
 const [category,best]=ranked[0],runner=ranked[1]?.[1].score??best.score;
 const confidence=1/ranked.reduce((sum,[,entry])=>sum+Math.exp((entry.score-best.score)*100),0);
 const clear=categories.includes(category as Piece['category'])&&best.score>=.25&&best.score-runner>=.02&&confidence>=.65;
 return {category:clear?category as Piece['category']:null,confidence,label:best.label};
}
