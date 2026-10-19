// Clothing-color families inspired by monochromatic, analogous and accent palettes.
// Match saved color labels; a swatch represents a family, not an exact fabric shade.
export const colorSwatches:Record<string,string>={White:'#ebebeb',Black:'#1e1e1e',Grey:'#828282',Navy:'#222f4a',Blue:'#3063b8',Green:'#4d6f47',Beige:'#cfbc97',Brown:'#724c2d',Red:'#bc2f31',Pink:'#dd8ca1',Purple:'#7c4b9b',Yellow:'#dec641',Orange:'#de8133',Multicolor:'linear-gradient(135deg,#3063b8,#dd8ca1,#dec641)'};
export type Colorway={name:string;colors:readonly string[];required:readonly (readonly string[])[]};
export const colorways:readonly Colorway[]=[
 {name:'Neutrals',colors:['White','Black','Grey','Beige'],required:[]},
 {name:'Navy & cream',colors:['Navy','White','Beige'],required:[['Navy'],['White','Beige']]},
 {name:'Earth tones',colors:['Green','Brown','Beige','White','Black'],required:[['Green','Brown']]},
 {name:'Blue tonal',colors:['Blue','Navy','Grey','White'],required:[['Blue','Navy']]},
 {name:'Pink & neutrals',colors:['Pink','Grey','White','Black','Beige'],required:[['Pink']]},
 {name:'Red accent',colors:['Red','Navy','White','Black'],required:[['Red']]},
 {name:'Green & neutrals',colors:['Green','Black','Grey','White'],required:[['Green']]},
 {name:'Violet & neutrals',colors:['Purple','Grey','White','Black','Beige'],required:[['Purple']]},
 {name:'Yellow accent',colors:['Yellow','Navy','White','Beige','Black'],required:[['Yellow']]},
 {name:'Warm orange',colors:['Orange','Brown','Beige','White','Black'],required:[['Orange']]},
 {name:'Blue & orange',colors:['Blue','Navy','Orange','White'],required:[['Blue','Navy'],['Orange']]},
 {name:'Print & neutrals',colors:['Multicolor','White','Black','Beige'],required:[['Multicolor']]},
];
export const colorwayOptions=['Automatic',...colorways.map(p=>p.name)];
export function findColorway(name:string){return colorways.find(p=>p.name===name);}
export function matchesColorway(items:readonly {color:string;pattern:string}[],palette:Colorway,complete=true){
 return items.length>0&&items.every(p=>palette.colors.includes(p.color))
  &&new Set(items.map(p=>p.color)).size<=3
  &&items.filter(p=>p.pattern!=='Solid'||p.color==='Multicolor').length<=1
  &&(!complete||palette.required.every(family=>items.some(p=>family.includes(p.color))));
}
