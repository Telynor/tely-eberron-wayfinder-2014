import test from 'node:test';
import assert from 'node:assert/strict';
import {ID} from '../scripts/mechanics.mjs';
const handlers=new Map(),notifications=[];
globalThis.Hooks={on(name,fn){const a=handlers.get(name)??[];a.push(fn);handlers.set(name,a);},once(name,fn){this.on(name,fn);},callAll(){}};
globalThis.foundry={utils:{deepClone:structuredClone,randomID:()=>Math.random().toString(36).slice(2,18),getProperty:(o,k)=>k.split('.').reduce((v,k)=>v?.[k],o),setProperty:(o,k,v)=>{const a=k.split('.'),last=a.pop();for(const x of a)o=o[x]??={};o[last]=v;}}};
globalThis.ui={notifications:{warn:m=>notifications.push(m),error:m=>notifications.push(m),info(){}}};
globalThis.game={user:{id:'gm',isGM:true,targets:new Set()},users:{activeGM:{id:'gm'},get:()=>({id:'gm'})},time:{worldTime:0},combat:null,actors:[],items:[],packs:[],modules:new Map([[ID,{}]]),settings:{register(){}}};
globalThis.canvas={tokens:{placeables:[]},scene:{grid:{size:100,distance:5},templates:[]}};
globalThis.CONFIG={JournalEntry:{compendiumIndexFields:[]},DND5E:{abilities:{wis:{label:'Wisdom'}},tools:{},skills:{}}};
globalThis.ChatMessage={getSpeaker:()=>({}),create:async d=>d,getWhisperRecipients:()=>[]};
globalThis.Roll=class{constructor(formula){this.formula=formula;this.total=3;}async evaluate(){return this;}async toMessage(){}};
const {magewrightConsumption,executeActivity}=await import('../scripts/main.mjs');
for(const fn of handlers.get('init')??[])fn();
const combat=await import('../scripts/combat.mjs');
const {handlers:actions}=await import('../scripts/character-actions.mjs');
const coll=a=>Object.assign(a,{get:id=>a.find(x=>x.id===id),has:id=>a.some(x=>x.id===id)});
const flags=d=>({[ID]:d});
function actor(items=[],hp={value:20,max:20,temp:0}){
 const a={uuid:'Actor.test',name:'Test',isOwner:true,type:'character',items:coll(items),effects:[],system:{details:{level:8},attributes:{hp,prof:3},abilities:{wis:{mod:2,value:14}},currency:{pp:1,gp:0}},_source:{system:{currency:{pp:1,gp:0},abilities:{wis:{value:14}}}},flags:flags({}),async update(u){for(const[k,v]of Object.entries(u))foundry.utils.setProperty(this,k,v);return this;},async setFlag(scope,key,v){this.flags[scope]??={};this.flags[scope][key]=v;},testUserPermission:()=>true};for(const i of items)i.actor=a;return a;
}
test('Greater Dragonmark setup cannot reset expended activity uses',async()=>{
 const feat={flags:flags({greaterMark:true,configured:true}),system:{activities:coll([{flags:flags({handler:'greater-cast'}),uses:{spent:1,max:'1'}}])},async update(){throw new Error('Configuration must not write or refill');}};
 const a=actor([{flags:flags({ancestry:true,mark:'healing'}),system:{}},feat]);
 await actions['greater-dragonmark']({actor:a,item:feat,config:{greater:{healing:[['wis'],'wis','lr',['Greater Restoration']]}}});assert.equal(feat.system.activities[0].uses.spent,1);
});
test('magewright costs join the native consumption transaction and use mixed coinage',()=>{
 const a=actor();const activity={actor:a,flags:flags({magewrightCost:5})},updates={actor:{}};
 assert.equal(magewrightConsumption(activity,{},null,updates),undefined);assert.equal(updates.actor['system.currency'].gp,5);assert.equal(a.system.currency.pp,1,'preparation must not spend before native commit');
 activity.flags[ID].magewrightCost=100;assert.equal(magewrightConsumption(activity,{},null,{actor:{}}),false);
});
test('cancelled custom actions preserve native resources',async()=>{
 foundry.applications={api:{DialogV2:{wait:async()=>null}}};
 const item={id:'item',flags:flags({key:'appearance'}),system:{uses:{spent:0,max:'1'},activities:[]},async update(){throw new Error('A cancelled action must not charge');}};
 const a=actor([item]),activity={id:'act',item,actor:a,flags:flags({handler:'appearance'}),consumption:{targets:[{type:'itemUses',target:'',value:'1'}]},activation:{type:'action'}};
 assert.equal(await executeActivity(activity),false);assert.equal(item.system.uses.spent,0);
});
test('orb damage is reduced before resistance and preserves temporary HP absorption',async()=>{
 const orb={id:'orb',flags:flags({orbTypes:['fire']}),system:{equipped:true,attunement:'required',attuned:true}},a=actor([orb],{value:20,max:20,temp:2});
 const raw=[{type:'fire',value:10},{type:'cold',value:4}],options={[ID]:{rawDamage:raw}};
 a.calculateDamage=d=>({amount:d.reduce((n,x)=>n+(x.type==='fire'?Math.floor(x.value/2):x.value),0)});
 assert.equal(combat.preApplyDamage(a,9,{},options),false);await combat.waitForDamage(a.uuid);
 assert.equal(a.system.attributes.hp.value,15);assert.equal(a.system.attributes.hp.temp,0);
});
test('a failed orb roll falls back to the original native damage update',async()=>{
 const original=globalThis.Roll;globalThis.Roll=class{async evaluate(){throw new Error('Roll interrupted');}};
 const a=actor([{flags:flags({orbTypes:['fire']}),system:{equipped:true,attunement:'',attuned:false}}]);
 combat.preApplyDamage(a,7,{'system.attributes.hp.value':13},{[ID]:{rawDamage:[{type:'fire',value:7}]}});
 await assert.rejects(combat.waitForDamage(a.uuid),/Roll interrupted/);assert.equal(a.system.attributes.hp.value,13);globalThis.Roll=original;
});
test('half cover exception retains three-quarters cover and applies only to the quarry',()=>{
 const quarry=actor();quarry.uuid='Actor.quarry';quarry.system.attributes.ac={value:14,cover:2};const a=actor([{flags:flags({quarry:quarry.uuid})}]);
 const t={actor:quarry,center:{x:10,y:0},document:{}};globalThis.MidiQOL={computeDistance:()=>30,computeCoverBonus:()=>2};
 const w={actor:a,token:{center:{x:0,y:0}},targets:new Set([t]),activity:{},targetDescriptors:[{uuid:quarry.uuid,ac:14}]};combat.quarryCover(w);assert.equal(w.targetDescriptors[0].ac,12);
 quarry.system.attributes.ac.cover=5;w.targetDescriptors=[{uuid:quarry.uuid,ac:17}];combat.quarryCover(w);assert.equal(w.targetDescriptors[0].ac,17);
});
test('quarry visibility removes invisible/hidden penalties while preserving other penalties',()=>{
 const quarry={uuid:'Actor.quarry'},a=actor([{flags:flags({quarry:quarry.uuid})}]);let state={disadvantage:{active:true},attribution:{DIS:{'invisible foe':'Invisible','long range':'Long range'}},legacyAttribution:['DIS:invisible foe','DIS:long range'],advReminderAttribution:[]};
 const w={actor:a,token:{},targets:new Set([{actor:quarry}]),attackRollModifierTracker:{toJSON:()=>state,restore:s=>{state=s;}}};combat.quarryVisibility(w);assert.equal(state.disadvantage.active,true);assert.deepEqual(Object.keys(state.attribution.DIS),['long range']);
});
test('a Spell Sink blocks foreign spell activities without intercepting unrelated mundane actions',()=>{
 globalThis.canvas.scene.flags=flags({machines:[{kind:'spell-sink',active:true,x:0,y:0,radius:100}]});canvas.scene.getFlag=()=>canvas.scene.flags[ID].machines;
 const a=actor();a.getActiveTokens=()=>[{center:{x:0,y:0}}];
 assert.match(combat.magicBlocked({actor:a,item:{type:'spell',system:{properties:new Set()}}}),/Spell Sink/);
 assert.equal(combat.magicBlocked({actor:a,item:{type:'weapon',system:{properties:new Set()}}}),null);
});
test('shared suffering transfers one odd remainder without applying resistance again or replaying',async()=>{
 const protectedActor=actor(),bearer=actor();protectedActor.uuid='Actor.protected';bearer.uuid='Actor.bearer';
 const ring={uuid:'Actor.bearer.Item.ring',actor:bearer,flags:flags({protectedActor:protectedActor.uuid}),system:{equipped:true,attuned:true,attunement:'required'}},partner={uuid:'Actor.protected.Item.ring',system:{equipped:true,attuned:true,attunement:'required'}};
 protectedActor.effects=[{id:'link',flags:flags({ownedEffect:true,protectedByRing:ring.uuid,pairedRing:partner.uuid})}];
 const documents=new Map([[protectedActor.uuid,protectedActor],[bearer.uuid,bearer],[ring.uuid,ring],[partner.uuid,partner]]);globalThis.fromUuid=async uuid=>documents.get(uuid);
 const transfers=[];bearer.applyDamage=async(d,o)=>{transfers.push({d,o});};protectedActor.calculateDamage=()=>({amount:9});
 combat.preApplyDamage(protectedActor,9,{}, {[ID]:{rawDamage:[{type:'fire',value:9}]}});await combat.waitForDamage(protectedActor.uuid);
 assert.equal(protectedActor.system.attributes.hp.value,16);assert.equal(transfers[0].d[0].value,5);assert.equal(transfers[0].o.ignore,true);assert.equal(transfers[0].o[ID].skip,true);
 const nonce=protectedActor.flags[ID].pendingTransfer.nonce;assert.equal(await combat.applyTransfer({sourceUuid:protectedActor.uuid,nonce}),false);assert.equal(transfers.length,1);
});
test('spell index prefers the canonical system entry and exposes missing cantrip services without compendium duplicates',async()=>{
 const {spellIndex,clearSpellIndex,chooseSpell}=await import('../scripts/spells.mjs');
 game.packs=[{documentName:'Item',visible:true,collection:'foreign.spells',getIndex:async()=>[{_id:'other',name:'Mending',type:'spell',system:{level:0,source:{rules:'2014'}}}],getUuid:id=>'Compendium.foreign.spells.Item.'+id},{documentName:'Item',visible:true,collection:'dnd5e.spells',getIndex:async()=>[{_id:'canon',name:'Mending',type:'spell',system:{level:0,source:{rules:'2014'}}}],getUuid:id=>'Compendium.dnd5e.spells.Item.'+id}];
 clearSpellIndex();const index=await spellIndex();assert.match(index.find(x=>x.name==='Mending').uuid,/dnd5e.spells/);assert.equal(index.filter(x=>x.name==='Mending').length,1);
 foundry.applications={api:{DialogV2:{wait:async()=>({choice:'wayfinder-service:blade ward'})}}};const s=await chooseSpell('Choose',s=>s.level===0);assert.equal(s.name,'Blade Ward');assert.equal(s.toObject().type,'spell');
});
