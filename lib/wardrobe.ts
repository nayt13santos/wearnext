export const categories = ['Top','Bottom','One-piece','Shoes','Layer','Accessory'] as const;
export type Category = typeof categories[number];
export const occasions = ['Everyday','Office','Dinner out','Formal event','Workout','Travel'] as const;
export const colors = ['White','Black','Grey','Navy','Blue','Green','Beige','Brown','Red','Pink','Purple','Yellow','Orange','Multicolor'] as const;
export type Piece = {id:string;name:string;category:Category;color:string;style:string;warmth:number;pattern:string;material:string;waterproof:boolean;laundry:boolean;archived:boolean;favorite:boolean;image:string;original?:string;sample?:number;fingerprint?:string;photoSourceUrl?:string;photoSourceLabel?:string};
export type Wear = {id:string;day:string;items:Piece[];occasion:string;temperature:number};
export type Preferences = {cooldown:number;city:string;latitude:number;longitude:number;budget:number;currency:string};
export type Context = {day:string;temperature:number;rain:boolean;occasion:string;aircon:boolean};
export const defaults:Preferences={cooldown:30,city:'Marikina',latitude:14.65,longitude:121.1,budget:1500,currency:'PHP'};
export function dayToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export function daysBetween(a:string,b:string){return Math.floor((Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/86400000);}
export function addDays(day:string,n:number){return new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);}
export function lastWorn(p:Piece,wears:Wear[],day:string){return wears.filter(w=>w.day<=day&&w.items.some(i=>i.id===p.id)).map(w=>w.day).sort().at(-1)||null;}
export function availability(p:Piece,wears:Wear[],day:string,cooldown:number){
 if(p.archived)return 'Archived'; if(p.laundry)return 'In laundry';
 const last=lastWorn(p,wears,day);if(last&&!['Shoes','Accessory'].includes(p.category)&&daysBetween(day,last)<cooldown)return `Resting until ${addDays(last,cooldown)}`;
 return 'Available';
}
export function matchesOccasion(p:Piece,occasion:string){
 if(occasion==='Formal event')return ['Formal','Versatile'].includes(p.style);
 if(occasion==='Office')return ['Smart','Formal','Versatile'].includes(p.style);
 if(occasion==='Workout')return ['Sport','Versatile'].includes(p.style);
 return occasion==='Dinner out'?p.style!=='Sport':true;
}
export function suitable(p:Piece,c:Context){return matchesOccasion(p,c.occasion)&&!(c.temperature>=27&&p.warmth===3)&&!(c.temperature<14&&p.warmth===1&&p.category==='Bottom');}
const neutral=new Set(['White','Black','Grey','Navy','Beige','Brown']);
export function colorMatch(a:Piece,b:Piece){return neutral.has(a.color)||neutral.has(b.color)||a.color===b.color||(['Blue','Green'].includes(a.color)&&['Blue','Green'].includes(b.color));}
export function compatible(items:Piece[]){return items.filter(i=>i.pattern!=='Solid').length<=1 && items.every((a,i)=>items.slice(i+1).every(b=>colorMatch(a,b)));}
export function scorePiece(p:Piece,c:Context,wears:Wear[]){
 const last=lastWorn(p,wears,c.day);const warmthTarget=c.temperature<18?3:c.temperature<25?2:1;
 return 40-Math.abs(p.warmth-warmthTarget)*10+(p.favorite?4:0)+(last?Math.min(20,daysBetween(c.day,last)/3):20)+(c.rain&&p.waterproof?10:0);
}
export function generateOutfit(pieces:Piece[],wears:Wear[],prefs:Preferences,c:Context,locks:string[]=[],previous:string[]=[],random= Math.random){
 const pool=pieces.filter(p=>availability(p,wears,c.day,prefs.cooldown)==='Available'&&suitable(p,c));
 const locked=locks.map(id=>pool.find(p=>p.id===id)).filter(Boolean) as Piece[];
 if(locked.length!==locks.length)return {items:[] as Piece[],reason:'A locked piece is unavailable for this date or occasion. Unlock it or change your plans.'};
 const grouped=new Map(categories.map(cat=>[cat,pool.filter(p=>p.category===cat).map(p=>({piece:p,score:scorePiece(p,c,wears)+(previous.includes(p.id)?0:12)+random()*15+(locks.includes(p.id)?1000:0)})).sort((a,b)=>b.score-a.score).slice(0,50).map(x=>x.piece)]));
 const groups=(cat:Category)=>grouped.get(cat)!;
 let best:Piece[]=[];let bestScore=-Infinity;
 const shoes=groups('Shoes');const layers=groups('Layer');
 const bodies:Piece[][]=[...groups('One-piece').map(p=>[p]),...groups('Top').flatMap(t=>groups('Bottom').map(b=>[t,b]))];
 for(const body of bodies){if(!compatible(body))continue;
  for(const shoe of shoes){let combo=[...body,shoe];
   const layerLock=locked.find(p=>p.category==='Layer');const layer=layerLock||layers.find(p=>compatible([...combo,p]));
   if(c.temperature<18&&!layer)continue;
   if(layer&&(layerLock||c.temperature<23||c.aircon))combo.push(layer);
   combo.push(...locked.filter(p=>p.category==='Accessory'));
   if(!locked.every(p=>combo.some(x=>x.id===p.id))||!compatible(combo))continue;
   const score=combo.reduce((s,p)=>s+scorePiece(p,c,wears)+(previous.includes(p.id)?0:10),0)/combo.length+random()*20;
   if(score>bestScore){bestScore=score;best=combo;}
  }
 }
 return {items:best,reason:best.length?'':`No complete outfit fits these rules. You need available ${shoes.length?'tops + bottoms (or a one-piece)':'shoes and a top + bottom (or a one-piece)'}${c.temperature<18?' plus a warm layer':''}. Add clothes, finish laundry, or adjust your occasion/rotation in Preferences.`};
}
export function similarity(a:Piece,b:Piece){
 if(a.category!==b.category)return 0;
 if(a.fingerprint&&a.fingerprint===b.fingerprint)return 100;
 return 35+(a.color===b.color?30:0)+(a.style===b.style?15:0)+(a.pattern===b.pattern?10:0)+(a.material===b.material?10:0);
}
export function purchaseScore(candidate:Piece,owned:Piece[],price:number|null,budget:number){
 const wardrobe=owned.filter(p=>!p.archived); const similar=wardrobe.map(p=>({piece:p,score:similarity(candidate,p)})).filter(s=>s.score>=75).sort((a,b)=>b.score-a.score);
 const grouped=new Map(categories.map(cat=>[cat,wardrobe.filter(p=>p.category===cat&&Math.abs(p.warmth-candidate.warmth)<=1&&(p.style===candidate.style||p.style==='Versatile'||candidate.style==='Versatile'||(['Casual','Smart'].includes(p.style)&&['Casual','Smart'].includes(candidate.style))))]));
 const cat=(x:Category)=>grouped.get(x)!;
 function* combinations():Generator<Piece[]>{
  if(candidate.category==='Top')for(const b of cat('Bottom'))for(const s of cat('Shoes'))yield [candidate,b,s];
  if(candidate.category==='Bottom')for(const t of cat('Top'))for(const s of cat('Shoes'))yield [t,candidate,s];
  if(candidate.category==='One-piece')for(const s of cat('Shoes'))yield [candidate,s];
  if(candidate.category==='Shoes'){for(const d of cat('One-piece'))yield [d,candidate];for(const t of cat('Top'))for(const b of cat('Bottom'))yield [t,b,candidate];}
  if(['Layer','Accessory'].includes(candidate.category)){for(const d of cat('One-piece'))for(const s of cat('Shoes'))yield [d,s,candidate];for(const t of cat('Top'))for(const b of cat('Bottom'))for(const s of cat('Shoes'))yield [t,b,s,candidate];}
 }
 let count=0,checked=0,limited=false;const previews:Piece[][]=[];
 for(const combination of combinations()){if(++checked>100000){limited=true;break;}if(compatible(combination)){count++;if(previews.length<4)previews.push(combination);}}
 const maxSimilarity=similar[0]?.score||0;
 const versatility=Math.min(40,count*5);const originality=Math.max(0,30-Math.round(maxSimilarity*.3));
 const same=wardrobe.filter(p=>p.category===candidate.category).length;const gap=same===0?20:same<3?15:same<6?8:3;
 const value=price===null||!Number.isFinite(price)||price<0?0:price<=budget?10:price<=budget*1.25?5:0;
 const raw=versatility+originality+gap+value;const total=count===0?Math.min(35,raw):raw;
 return {score:total,combos:count,limited,previews,similar,breakdown:{versatility,originality,gap,value},verdict:wardrobe.length<3?'Add more of your wardrobe first':total>=75?'A useful addition':total>=50?'Consider it carefully':'Probably skip it',lowConfidence:wardrobe.length<3};
}
const sample=(id:string,name:string,category:Category,color:string,style:string,warmth:number,sample:number,material='Cotton'):Piece=>({id,name,category,color,style,warmth,sample,material,pattern:'Solid',waterproof:false,laundry:false,archived:false,favorite:false,image:'/demo-catalog.png'});
export const demoPieces=[sample('demo-1','White linen shirt','Top','White','Smart',1,0,'Linen'),sample('demo-2','Blue everyday tee','Top','Blue','Casual',1,1),sample('demo-3','Charcoal trousers','Bottom','Grey','Smart',2,2),sample('demo-4','Navy chino shorts','Bottom','Navy','Casual',1,3),sample('demo-5','White low-top sneakers','Shoes','White','Versatile',1,4),sample('demo-6','Olive overshirt','Layer','Green','Smart',2,5)];
