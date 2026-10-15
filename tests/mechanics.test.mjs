import test from 'node:test';
import assert from 'node:assert/strict';
import {ID,integratedArmor,shiftingStats,splitSharedDamage,reduceTypedDamage,intuitionFor,intuitionDie,craftingCost,payGold,currencyCopper,duplicateGroups,canonicalKey,docReferences,sizeAtMost} from '../scripts/mechanics.mjs';
const f=(data,system={})=>({flags:{[ID]:data},system});
test('2018 integrated armor: proficiency gates, low Dex and each calculation',()=>{
 assert.equal(integratedArmor('darkwood',{dex:3,proficiency:4}).base,14);
 assert.equal(integratedArmor('darkwood',{dex:3,proficiency:4,armor:['lgt']}).base,18);
 assert.equal(integratedArmor('composite',{dex:4,proficiency:3,armor:['med']}).base,18);
 assert.equal(integratedArmor('composite',{dex:-2,proficiency:3,armor:['med']}).base,14);
 assert.deepEqual(integratedArmor('heavy',{dex:5,proficiency:6,armor:['hvy']}),{base:22,stealthDisadvantage:true});
 assert.throws(()=>integratedArmor('heavy',{armor:['med']}),/Heavy/);
});
test('shifting preserves level scaling, minimum HP and Beasthide die',()=>{
 assert.equal(shiftingStats(1,-3,'longtooth').tempHP,1);
 assert.equal(shiftingStats(6,3,'beasthide',4).tempHP,13);
 assert.equal(shiftingStats(6,3,'swiftstride').speed,5);
 assert.equal(shiftingStats(6,3,'wildhunt').wisdomAdvantage,true);
});
test('shared suffering transfers the odd remainder, with no negative damage',()=>{
 assert.deepEqual(splitSharedDamage(9),{protectedDamage:4,transferredDamage:5});
 assert.deepEqual(splitSharedDamage(0),{protectedDamage:0,transferredDamage:0});
 assert.deepEqual(splitSharedDamage(-8),{protectedDamage:0,transferredDamage:0});
});
test('one orb reduction covers matching components once and leaves other types intact',()=>{
 const original=[{type:'acid',value:2,properties:new Set(['mgc'])},{type:'poison',value:5},{type:'cold',value:7}];
 const reduced=reduceTypedDamage(original,['acid','poison'],4);
 assert.deepEqual(reduced.map(x=>x.value),[0,3,7]);assert.deepEqual(original.map(x=>x.value),[2,5,7]);
 assert.notEqual(reduced[0].properties,original[0].properties);
});
test('conditional intuition never leaks to unrelated checks; initiative remains unconditional',()=>{
 const actor={items:[f({key:'mark:sentinel',intuition:{skills:['prc'],initiative:true,conditional:true}})]};
 assert.equal(intuitionFor(actor,{skill:'prc'}),null);
 assert.equal(intuitionFor(actor,{skill:'prc',context:true}).die,4);
 assert.equal(intuitionFor(actor,{initiative:true}).die,4);
 assert.equal(intuitionFor(actor,{skill:'arc',context:true}),null);
 actor.items.push(f({key:'g',greaterMark:true,configured:true}));assert.equal(intuitionFor(actor,{initiative:true}).die,6);
 assert.equal(intuitionDie({sources:5,greater:true}),10);
});
test('original prototype crafting row, consumables and focus discounts are preserved',()=>{
 assert.equal(craftingCost('legendary').weeks,20);
 assert.equal(craftingCost('rare',{consumable:true,focus:true}).gold,500);
 assert.equal(craftingCost('rare',{consumable:true}).weeks,5);
 assert.throws(()=>craftingCost('imaginary'),/Unknown/);
});
test('gold spending can use mixed coinage and never mutates or overdraws a wallet',()=>{
 const wallet={pp:2,gp:4,ep:1,sp:6,cp:2},before=structuredClone(wallet),paid=payGold(wallet,5);
 assert.equal(currencyCopper(paid),currencyCopper(wallet)-500);assert.deepEqual(wallet,before);
 assert.throws(()=>payGold(wallet,100),/Insufficient/);
});
test('duplicate identity handles apostrophes, equipment type changes and class feature parents',()=>{
 const entries=[{type:'equipment',name:'Scribe’s Pen'},{type:'loot',name:"Scribe's Pen"},{type:'feat',name:'Extra Attack',flags:{'tely-tashas-2014':{parent:'Fighter'}}},{type:'feat',name:'Extra Attack',flags:{'tely-tashas-2014':{parent:'Barbarian'}}}];
 assert.equal(duplicateGroups(entries).length,1);assert.equal(duplicateGroups(entries)[0].entries.length,2);
 assert.notEqual(canonicalKey(entries[2]),canonicalKey(entries[3]));
});
test('UUID references are found inside nested choices and links; unknown sizes fail safely',()=>{
 assert.deepEqual([...docReferences({pool:[{uuid:'Compendium.example.feats.Item.abcdefgh12345678'}],body:'@UUID[Compendium.example.spells.Item.zzzzzzzz12345678]{Spell}'})].sort(),['Compendium.example.feats.Item.abcdefgh12345678','Compendium.example.spells.Item.zzzzzzzz12345678']);
 assert.equal(sizeAtMost('sm','med'),true);assert.equal(sizeAtMost('other','med'),false);
});
