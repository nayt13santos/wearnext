import {test} from 'node:test';
import assert from 'node:assert/strict';
import {availability,generateOutfit,defaults,demoPieces,purchaseScore,similarity,type Wear,type Context} from '../lib/wardrobe.ts';
const context:Context={day:'2026-09-27',temperature:30,rain:false,occasion:'Everyday',aircon:false};
const history:Wear[]=[{id:'wear',day:'2026-09-01',items:[demoPieces[0],demoPieces[4]],occasion:'Everyday',temperature:30}];
test('clothes rest for 30 full days; shoes and accessories can repeat',()=>{
 assert.match(availability(demoPieces[0],history,'2026-09-30',30),/Resting/);
 assert.equal(availability(demoPieces[0],history,'2026-10-01',30),'Available');
 assert.equal(availability(demoPieces[4],history,'2026-09-01',30),'Available');
 const accessory={...demoPieces[0],category:'Accessory' as const};
 assert.equal(availability(accessory,history,'2026-09-01',30),'Available');
});
test('laundry and archives override rotation exemptions',()=>{
 assert.equal(availability({...demoPieces[4],laundry:true},history,context.day,30),'In laundry');
 assert.equal(availability({...demoPieces[4],archived:true},history,context.day,30),'Archived');
});
test('suggestions obey cooldown and do not mutate wardrobe/history',()=>{
 const before=JSON.stringify([demoPieces,history]);
 const result=generateOutfit(demoPieces,history,defaults,context,[],[],()=>0.5);
 assert.ok(result.items.length>=3);assert.ok(!result.items.some(p=>p.id===demoPieces[0].id));
 assert.equal(JSON.stringify([demoPieces,history]),before);
});
test('locks are retained, including in larger wardrobes',()=>{
 const many=Array.from({length:60},(_,i)=>({...demoPieces[0],id:'top'+i}));
 const r=generateOutfit([...many,...demoPieces.slice(2)],[],defaults,context,['top59'],[],()=>0.5);
 assert.ok(r.items.some(p=>p.id==='top59'));
});
test('never silently repeat an unavailable locked item',()=>{
 const r=generateOutfit(demoPieces,history,defaults,context,[demoPieces[0].id]);
 assert.equal(r.items.length,0);assert.match(r.reason,/locked piece/);
});
test('no complete outfit without shoes, and cold weather requires a layer',()=>{
 assert.equal(generateOutfit(demoPieces.filter(p=>p.category!=='Shoes'),[],defaults,context).items.length,0);
 assert.equal(generateOutfit(demoPieces.filter(p=>p.category!=='Layer'),[],defaults,{...context,temperature:12}).items.length,0);
});
test('purchase score flags similar owned pieces and counts actual combinations',()=>{
 const score=purchaseScore({...demoPieces[0],id:'candidate'},demoPieces,500,1500);
 assert.equal(score.combos,2);assert.equal(score.previews.length,2);assert.equal(score.similar[0].score,100);
 assert.ok(score.score>=0&&score.score<=100);
 assert.equal(purchaseScore(demoPieces[0],[],500,1500).lowConfidence,true);
 assert.equal(purchaseScore(demoPieces[0],demoPieces,-5,1500).breakdown.value,0);
 assert.equal(similarity({...demoPieces[0],fingerprint:'test'},{...demoPieces[0],fingerprint:'test'}),100);
});
test('large wardrobe scoring is bounded and labels partial counts',()=>{
 const many=Array.from({length:55},(_,i)=>[0,2,4].map(j=>({...demoPieces[j],id:`${i}-${j}`}))).flat();
 const score=purchaseScore(demoPieces[5],many,500,1500);
 assert.equal(score.limited,true);assert.ok(score.combos<=100000);assert.equal(score.previews.length,4);
});
