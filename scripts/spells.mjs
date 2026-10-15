import {ID,meta,values,normalize} from './mechanics.mjs';
import {choose,requireOwner,makeEffect,say,escape,tokenFor,form,confirm,concentrate} from './ui.mjs';
let indexCache=null;
const SERVICE_SPELLS=[{name:'Blade Ward',level:0,school:'abj'},{name:'Friends',level:0,school:'enc'},{name:'Compelled Duel',level:1,school:'enc'},{name:'Beast Sense',level:2,school:'div'},{name:'Control Winds',level:5,school:'trs'}];
const ALIASES={"mordenkainen s magnificent mansion":"magnificent mansion","leomund s secret chest":"secret chest","locate animal or plant":"locate animals or plants"};
export const WIZARD_CANTRIPS=new Set(['Acid Splash','Blade Ward','Booming Blade','Chill Touch','Control Flames','Create Bonfire','Dancing Lights','Fire Bolt','Friends','Frostbite','Green-Flame Blade','Gust','Infestation','Light','Lightning Lure','Mage Hand','Mending','Message','Mind Sliver','Minor Illusion','Mold Earth','Poison Spray','Prestidigitation','Ray of Frost','Shape Water','Shocking Grasp','Sword Burst','Thunderclap','Toll the Dead','True Strike'].map(normalize));
export const SORCERER_FIRST=new Set(['Burning Hands','Catapult','Chaos Bolt','Charm Person','Chromatic Orb','Color Spray','Comprehend Languages','Detect Magic','Disguise Self','Distort Value','Earth Tremor','Expeditious Retreat','False Life','Feather Fall','Fog Cloud','Ice Knife','Jump','Mage Armor','Magic Missile','Ray of Sickness','Shield','Silent Image','Silvery Barbs','Sleep','Thunderwave','Witch Bolt'].map(normalize));
export function clearSpellIndex(){indexCache=null;}
export async function spellIndex(){
 if(indexCache)return indexCache;
 const all=[];
 for(const pack of game.packs.filter(p=>p.documentName==='Item'&&p.visible)){
  const idx=await pack.getIndex({fields:['type','system.level','system.source.rules','system.school']});
  for(const e of idx)if(e.type==='spell'&&e.system?.source?.rules!=='2024')all.push({name:e.name,uuid:pack.getUuid(e._id),level:e.system?.level??0,school:e.system?.school,pack:pack.collection});
 }
 for(const s of SERVICE_SPELLS)if(!all.some(e=>normalize(e.name)===normalize(s.name)))all.push({...s,uuid:'wayfinder-service:'+normalize(s.name),service:true,pack:ID});
 all.sort((a,b)=>(a.pack.startsWith('dnd5e.spells')?-2:a.pack.startsWith('tely-tashas-2014')?-1:0)-(b.pack.startsWith('dnd5e.spells')?-2:b.pack.startsWith('tely-tashas-2014')?-1:0));
 const unique=new Map();for(const v of all)if(!unique.has(normalize(v.name)))unique.set(normalize(v.name),v);indexCache=[...unique.values()];return indexCache;
}
export async function findSpell(name){
 const n=ALIASES[normalize(name)]??normalize(name);
 const owned=game.items.find(i=>i.type==='spell'&&normalize(i.name)===n&&i.system.source.rules!=='2024');if(owned)return owned;
 const e=(await spellIndex()).find(i=>normalize(i.name)===n);return e&&!e.service?fromUuid(e.uuid):null;
}
export async function chooseSpell(title,predicate){
 const list=(await spellIndex()).filter(predicate);const id=await choose(title,list.map(s=>({value:s.uuid,label:s.name})));return id?.startsWith('wayfinder-service:')?serviceSpell(id.slice(18)):id?fromUuid(id):null;
}
export async function castSpell(actor,name,{ability='int',level=null,ritual=false,materialComponents=true,slot=false,sourceItem=null,boost=0}={}){
 requireOwner(actor);const spell=await findSpell(name);
 if(!spell)return supplemental(actor,name,{ability,sourceItem});
 const data=spell.toObject();delete data._id;delete data.folder;delete data._stats;
 data.system.method='innate';data.system.prepared=2;data.system.ability=ability;
 data.flags??={};data.flags[ID]={serviceCast:true,sourceItemUuid:sourceItem?.uuid};
 const targetLevel=level??spell.system.level;
 for(const a of Object.values(data.system.activities??{})){
  a.consumption??={};a.consumption.spellSlot=slot;a.consumption.targets=[];
  if(a.attack)a.attack.ability=ability;
  if(a.save?.dc?.calculation==='spellcasting')a.save.dc={calculation:'',formula:`8 + @prof + @abilities.${ability}.mod`};
  if(ritual)a.activation={type:'minute',value:10,override:true,condition:'Ritual casting only; no spell slot'};
 }
 if(!materialComponents)data.system.properties=(data.system.properties??[]).filter(p=>p!=='material');
 const [temp]=await actor.createEmbeddedDocuments('Item',[data],{[ID]:{temporary:true}});
 try{
  if(globalThis.MidiQOL?.completeItemUse)return await MidiQOL.completeItemUse(temp,{configureDialog:true,spellLevel:targetLevel+boost,spell:{slot:targetLevel+boost}},{consumeResource:false,consumeSpellSlot:false,consumeUsage:false,configureDialog:true,workflowOptions:{autoRollDamage:'default'}});
  return await temp.use({spellLevel:targetLevel+boost,consume:{spellSlot:false,resource:false,usage:false}});
 }finally{if(actor.items.has(temp.id))await temp.delete();}
}
async function supplemental(actor,name,{ability,sourceItem}={}){
 const n=normalize(name);
 if(n==='blade ward'){
  await makeEffect(actor,'Blade Ward',{seconds:12,data:{bladeWard:true,expires:'endNextTurn',createdRound:game.combat?.round,createdTurn:game.combat?.turn,endTurnRound:game.combat?game.combat.round+(game.combat.turns.findIndex(c=>c.actor?.uuid===actor.uuid)<=game.combat.turn?1:0):null,combatId:game.combat?.id},origin:sourceItem?.uuid});
  return say(actor,'Blade Ward','<p>Weapon attack bludgeoning, piercing and slashing damage is resisted until the end of your next turn.</p>');
 }
 if(n==='friends'){
  const target=[...game.user.targets][0]?.actor;if(!target)throw new Error('Target the creature affected by Friends.');
  if(!await confirm('Friends','Confirm the chosen creature is not hostile toward you.'))return false;
  const concentration=await concentrate(actor,sourceItem,60);if(!concentration)return false;
  await makeEffect(actor,'Friends',{seconds:60,data:{friendsTarget:target.uuid,concentrationUuid:concentration.uuid},origin:sourceItem?.uuid});
  return say(actor,'Friends',`<p>Charisma checks directed at ${escape(target.name)} gain advantage for up to one minute while concentrating. The creature becomes hostile when the effect ends.</p>`);
 }
 if(n==='compelled duel'){
  const target=[...game.user.targets][0]?.actor;if(!target)throw new Error('Target a creature within 30 feet.');
  const a=tokenFor(actor),t=tokenFor(target);if(a&&t&&canvas.grid.measurePath([a.center,t.center]).distance>30)throw new Error('The target is beyond 30 feet.');
  const dc=8+actor.system.attributes.prof+actor.system.abilities[ability].mod;
  const concentration=await concentrate(actor,sourceItem,60);if(!concentration)return false;
  const rolls=await target.rollSavingThrow({ability:'wis',target:dc},{configure:true});
  if(rolls?.[0]?.total<dc)await makeEffect(target,'Compelled Duel',{seconds:60,data:{duelSource:actor.uuid,saveDC:dc,concentrationOwner:actor.uuid,concentrationUuid:concentration.uuid},origin:sourceItem?.uuid});
  return say(actor,'Compelled Duel',`<p>Wisdom save DC ${dc}. A failed target has disadvantage against other creatures; moving more than 30 feet away requires another Wisdom save. The printed ending conditions are checked by the combat controls.</p>`);
 }
 if(n==='beast sense'){
  const target=[...game.user.targets][0]?.actor;if(!target)throw new Error('Target a willing beast within touch range.');
  const a=tokenFor(actor),t=tokenFor(target);if(!a||!t||canvas.grid.measurePath([a.center,t.center]).distance>5)throw new Error('Touch the willing beast.');
  const type=target.system.details.type?.value,expanded=values(actor.items).some(i=>meta(i).key==='mark:handling:the-bigger-they-are')&&type==='monstrosity'&&target.system.abilities.int.value<=3;
  if(type!=='beast'&&!expanded)throw new Error('This spell requires a beast (or an eligible low-Intelligence monstrosity with The Bigger They Are).');
  if(!await confirm('Beast Sense','Confirm the creature is willing.'))return false;
  const concentration=await concentrate(actor,sourceItem,3600);if(!concentration)return false;
  await makeEffect(actor,'Beast Sense: Linked',{seconds:3600,data:{beastSenseTarget:target.uuid,concentrationUuid:concentration.uuid},origin:sourceItem?.uuid});
  return say(actor,'Beast Sense',`<p>Linked to ${escape(target.name)} for up to one hour while concentrating. Use the senses activity to switch perception. The GM shares the beast’s visible and audible information.</p>`);
 }
 if(n==='control winds'){
  const choice=await choose('Control Winds',['Updraft','Downdraft','Gusts']);if(!choice)return false;
  const token=tokenFor(actor);if(!token)throw new Error('Place your caster on the current scene.');
  const settings=await form('Wind Cube',[{name:'intensity',label:'Gust intensity',options:['calm','moderate','strong']},{name:'direction',label:'Wind bearing (degrees)',type:'number',value:0},{name:'elevation',label:'Bottom elevation (feet)',type:'number',value:token.document.elevation??0}]);if(!settings)return false;
  const concentration=await concentrate(actor,sourceItem,3600);if(!concentration)return false;
  const d={t:'rect',x:token.center.x,y:token.center.y,distance:Math.SQRT2*100,direction:45,fillColor:game.user.color.css??'#6688cc',flags:{[ID]:{controlWinds:choice,caster:actor.uuid,intensity:settings.intensity,bearing:settings.direction,elevation:settings.elevation,saveDC:8+actor.system.attributes.prof+actor.system.abilities[ability].mod,concentrationUuid:concentration.uuid,expiresAt:game.time.worldTime+3600}}};
  await canvas.scene.createEmbeddedDocuments('MeasuredTemplate',[d]);
  return say(actor,'Control Winds',`<p>${escape(choice)} created. Position the 100-foot cube within 300 feet. Use Manage Wind Cube to change or pause the wind as an action; concentration ends its effects.</p>`);
 }
 throw new Error(`${name} is not installed. Add its 2014 entry to a spell compendium, then run Validate Installed Wayfinder Content.`);
}
export async function grantSpell(actor,spell,{ability='int',source,key,permanent=false}={}){
 const existing=values(actor.items).find(i=>i.type==='spell'&&normalize(i.name)===normalize(spell.name));if(existing)return existing;
 const data=spell.toObject();delete data._id;delete data.folder;
 data.system.method='innate';data.system.prepared=2;data.system.ability=ability;data.flags??={};data.flags[ID]={grantedSpell:true,sourceItemUuid:source?.uuid,key,permanent};
 for(const a of Object.values(data.system.activities??{})){a.consumption??={};a.consumption.spellSlot=false;a.consumption.targets=[];if(a.flags?.[ID]?.handler==='cast-spell')a.flags[ID].ability=ability;if(a.attack)a.attack.ability=ability;if(a.save?.dc?.calculation==='spellcasting')a.save.dc={calculation:'',formula:`8 + @prof + @abilities.${ability}.mod`};}
 return (await actor.createEmbeddedDocuments('Item',[data]))[0];
}

function serviceSpell(key){
 const entry=SERVICE_SPELLS.find(s=>normalize(s.name)===key);if(!entry)return null;
 const id=foundry.utils.randomID(),data={name:entry.name,type:'spell',img:'icons/magic/symbols/runes-carved-stone-green.webp',system:{level:entry.level,school:entry.school,method:'innate',prepared:2,properties:['vocal','somatic'],description:{value:'<p>Wayfinder spell service. An installed canonical 2014 spell takes precedence.</p>'},activities:{[id]:{_id:id,name:'Cast '+entry.name,type:'utility',activation:{type:'action',value:1,override:true},roll:{formula:'',prompt:false},consumption:{spellSlot:false,targets:[]},flags:{[ID]:{handler:'cast-spell',spell:entry.name,ability:'int'}}}}},flags:{[ID]:{serviceDefinition:true}}};
 return {...data,toObject:()=>foundry.utils.deepClone(data)};
}
