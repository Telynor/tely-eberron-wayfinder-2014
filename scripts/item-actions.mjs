import {ID,meta,values,isEquipped,actorMark,isWarforged,normalize,craftingCost,payGold} from './mechanics.mjs';
import {choose,form,confirm,say,escape,roll,makeEffect,removeEffects,actorEffects,tokenFor,targetActor,requireOwner,requireGM,distance,activeGM} from './ui.mjs';
import {castSpell,findSpell,spellIndex,clearSpellIndex} from './spells.mjs';
export const itemHandlers={};
const updateMeta=(item,d)=>item.update(Object.fromEntries(Object.entries(d).map(([k,v])=>[`flags.${ID}.${k}`,v])));
const MATERIALS=[['Fernian','fire'],['Irian','radiant'],['Kythrian','acid','poison'],['Lamannian','lightning','thunder'],['Mabaran','necrotic'],['Quori','psychic'],['Xorian','psychic'],['Risian','cold'],['Shavarran','force']];
itemHandlers['imbued-wood']=async({item})=>{const name=await choose('Imbued Wood',MATERIALS.map(m=>({value:m[0],label:m[0]+' · '+m.slice(1).join(' / ')})));if(!name)return false;await updateMeta(item,{focusMaterial:name,focusTypes:MATERIALS.find(m=>m[0]===name).slice(1),configured:true});return true;};
itemHandlers['orb-material']=async({item})=>{const name=await choose('Orb of Shielding',MATERIALS.map(m=>({value:m[0],label:m[0]+' · '+m.slice(1).join(' / ')})));if(!name)return false;await updateMeta(item,{orbMaterial:name,orbTypes:MATERIALS.find(m=>m[0]===name).slice(1),configured:true});return true;};
itemHandlers['cosmetic']=async({actor,item})=>{const d=await form(item.name,[{name:'description',label:'Describe the effect',type:'textarea'}]);if(!d)return false;await say(actor,item.name,`<p>${escape(d.description)}</p>`);return true;};
itemHandlers['lantern']=async({actor,item})=>{
 const tokens=actor.getActiveTokens(true,true).map(t=>t.document??t),lit=!meta(item).lanternOpen;
 for(const token of tokens){
  if(lit){await updateMeta(item,{previousLight:foundry.utils.deepClone(token._source.light)});await token.update({light:{bright:60,dim:120,angle:90,color:'#ffe8b5',alpha:0.3}});}
  else if(meta(item).previousLight)await token.update({light:meta(item).previousLight});
 }
 await updateMeta(item,{lanternOpen:lit});return true;
};
itemHandlers['shiftweave']=async({actor,item})=>{
 const saved=meta(item).outfits??[];const mode=await choose('Shiftweave',[{value:'wear',label:'Wear an outfit'},{value:'configure',label:'Set up to five outfits'}]);if(!mode)return false;
 if(mode==='configure'){
  const fields=Array.from({length:5},(_,i)=>({name:'outfit'+i,label:'Outfit '+(i+1),value:saved[i]??''}));const d=await form('Shiftweave Outfits',fields);if(!d)return false;
  await updateMeta(item,{outfits:Object.values(d).map(s=>s.trim()).filter(Boolean).slice(0,5),configured:true});return true;
 }
 const name=await choose('Change Outfit',saved);if(!name)return false;await updateMeta(item,{activeOutfit:name});await say(actor,'Shiftweave',`<p>Outfit changed to ${escape(name)}.</p>`);return true;
};
itemHandlers['spellshard']=async({actor,item})=>{
 const d=await form('Spellshard',[{name:'passphrase',label:'Mental passphrase (if configured)'},{name:'search',label:'Search phrase or subject'},{name:'content',label:'Stored text / spellbook notes',type:'textarea',value:meta(item).passphrase?'':meta(item).shardText??''},{name:'setpass',label:'Set or replace mental passphrase (optional)'}]);if(!d)return false;
 if(meta(item).passphrase&&d.passphrase!==meta(item).passphrase)throw new Error('The mental passphrase does not match.');
 if(d.content)await updateMeta(item,{shardText:d.content});if(d.setpass)await updateMeta(item,{passphrase:d.setpass});
 const body=d.content||meta(item).shardText||'';const i=d.search?body.toLowerCase().indexOf(d.search.toLowerCase()):0;
 await say(actor,'Spellshard',`<p>${escape(i<0?'No matching passage.':body.slice(Math.max(0,i),Math.max(0,i)+3000))}</p>`,{whisper:true});return true;
};
itemHandlers['bounty']=async({actor,item})=>{
 const quality=await choose('Bag of Bounty',[{value:'0',label:'Poor · no roll'},{value:'10',label:'Modest · DC 10'},{value:'13',label:'Comfortable · DC 13'},{value:'15',label:'Wealthy · DC 15'},{value:'18',label:'Aristocratic · DC 18'}]);if(quality==null)return false;
 const dc=Number(quality);let result=null;
 if(dc){const tool=actor.system.tools?.cook;const bonus=actor.system.abilities.cha.mod+(tool?.value>=1?actor.system.attributes.prof*(tool.value>=2?2:1):0);result=await roll(`1d20 + ${bonus}`,actor,'Bag of Bounty: Food Quality');}
 if(!await castSpell(actor,'Create Food and Water',{ability:'cha',sourceItem:item}))return false;
 await say(actor,'Bag of Bounty',`<p>${!dc?'Plain fare.':result.total>=dc?'The requested meal quality is achieved.':'The attempt produces sour and squalid food.'} Food and water are created for the spell’s normal number of creatures.</p>`);return true;
};
itemHandlers['aura-check']=async({actor,item})=>{
 const d=await form('Identify Last Living Touch',[{name:'days',label:'Days since the last contact (GM supplies this)',type:'number',min:0,value:0}]);if(!d)return false;
 const results=await actor.rollSkill({skill:'prc',target:13+d.days});if(!results?.length)return false;
 if(results[0].total>=13+d.days){await say(actor,"Inquisitive's Goggles",'<p>Aura identified. The GM reveals the creature’s species. Target that creature, or provide its Actor UUID, to imprint the quarry without another check.</p>');const input=await form('Imprint Aura',[{name:'uuid',label:'Actor UUID',value:[...game.user.targets][0]?.actor?.uuid??''}]);if(input?.uuid){const prey=await fromUuid(input.uuid);const imprint=values(actor.items).find(i=>meta(i).key==='mark:finding:imprint-prey');if(prey&&imprint)await updateMeta(imprint,{quarry:prey.uuid});}}
 return true;
};
itemHandlers['keycharm']=async({actor,item})=>{
 const action=await choose('Keycharm',['Bind ward','List wards','Deactivate ward']);if(!action)return false;
 const wards=meta(item).wards??[];
 if(action==='Bind ward'){
  const d=await form('Bind Keycharm',[{name:'uuid',label:'Ward effect, template or Item UUID'}]);if(!d)return false;const ward=await fromUuid(d.uuid);if(!ward)throw new Error('The ward could not be found.');
  await updateMeta(item,{wards:[...new Set([...wards,d.uuid])]});
  if(ward.isOwner||game.user.isGM)await ward.setFlag(ID,'keycharm',item.uuid);
  await say(actor,'Keycharm','<p>Ward linked. The carrier is recognized as its owner for this enchantment’s notifications and bypasses.</p>');
 }else if(action==='List wards')await say(actor,'Keycharm',`<ul>${wards.map(w=>`<li>@UUID[${escape(w)}]</li>`).join('')}</ul>`,{whisper:true});
 else{const id=await choose('Deactivate Ward',wards);if(!id)return false;const ward=await fromUuid(id);if(!ward)throw new Error('The ward is no longer present.');if(ward.documentName==='ActiveEffect')await removeEffects(ward.parent,[ward.id]);else if(ward.isOwner||game.user.isGM)await ward.delete();else throw new Error('Ask the GM to deactivate this ward.');await updateMeta(item,{wards:wards.filter(w=>w!==id)});}
 return true;
};
itemHandlers['shared-suffering']=async({actor,item})=>{
 if(meta(item).protectedActor){const old=await fromUuid(meta(item).protectedActor);if(old)await removeEffects(old,actorEffects(old,m=>m.protectedByRing===item.uuid).map(e=>e.id));await updateMeta(item,{protectedActor:null});return true;}
 const target=targetActor(actor);if(target.uuid===actor.uuid)throw new Error('Link the other ring’s wearer.');
 const partner=values(target.items).find(i=>meta(i).itemKind==='rings-of-shared-suffering'&&isEquipped(i));if(!partner)throw new Error('The target must wear and be attuned to the linked ring.');
 if(values(actor.items).filter(i=>meta(i).itemKind==='rings-of-shared-suffering'&&i.system.attuned).length>1)throw new Error('A creature can attune to only one ring of shared suffering.');
 await updateMeta(item,{protectedActor:target.uuid,pairedRing:partner.uuid});
 await makeEffect(target,'Shared Suffering',{data:{protectedByRing:item.uuid,bearerActor:actor.uuid,pairedRing:partner.uuid},origin:item.uuid});return true;
};
itemHandlers['scribes-pen']=async({actor,item})=>{
 const d=await form("Scribe's Pen",[{name:'text',label:'Writing',type:'textarea'},{name:'surface',label:'Surface or creature'},{name:'visible',label:'Visible to everyone',type:'checkbox',value:true}]);if(!d)return false;
 const records=meta(item).inscriptions??[];records.push({...d,time:game.time.worldTime});await updateMeta(item,{inscriptions:records});await say(actor,"Scribe's Pen",`<p>${escape(d.surface)}: ${escape(d.text)}</p>`,{whisper:!d.visible});return true;
};
itemHandlers['wheel']=async({actor,item})=>{
 const d=await form('Wheel of Wind and Water',[{name:'vessel',label:'Vehicle Actor UUID'},{name:'elemental',label:'Elemental vessel (otherwise a mundane sailing ship)',type:'checkbox',value:true}]);if(!d)return false;const vessel=await fromUuid(d.vessel);if(!vessel)throw new Error('The vehicle could not be found.');
 await updateMeta(item,{vessel:vessel.uuid});await makeEffect(vessel,'Wheel of Wind and Water',{changes:d.elemental?[]:[['system.attributes.movement.travel',5]],data:{helmsman:actor.uuid,elementalControl:d.elemental,speedMphBonus:d.elemental?0:5},origin:item.uuid});return say(actor,'Control Vessel',`<p>${escape(vessel.name)}: ${d.elemental?'telepathic control of the bound elemental.':'+5 miles per hour in ideal conditions.'}</p>`);
};
itemHandlers['armblade']=async({actor,item})=>{
 const candidates=values(actor.items).filter(i=>i.type==='weapon'&&i.id!==item.id&&!i.system.properties?.has?.('two')&&i.system.type?.value?.endsWith('M'));
 const id=await choose('Armblade Weapon Profile',candidates.map(i=>({value:i.id,label:i.name})),'Select an owned one-handed melee weapon as the mechanical template. The original weapon is retained.');if(!id)return false;
 const source=actor.items.get(id);const changes={};for(const k of ['type','damage','properties','range','proficient'])if(source._source.system[k]!=null)changes['system.'+k]=foundry.utils.deepClone(source._source.system[k]);
 changes['system.properties']=changes['system.properties']??[];changes[`flags.${ID}.configured`]=true;changes[`flags.${ID}.weaponProfile`]=source.name;
 await item.update(changes);return true;
};
itemHandlers['docent']=async({actor,item})=>{
 const traits=meta(item).docentTraits??[];const action=await choose('Docent',[{value:'consult',label:'Request assistance (bonus action)'},{value:'configure',label:'Configure traits and languages'}]);if(!action)return false;
 const opts=[{value:'detect-magic',label:'Detect Magic at will'},{value:'detect-evil',label:'Detect Evil and Good at will'},{value:'scrying',label:'Detect divination and scrying'},{value:'arc',label:'Arcana +7'},{value:'his',label:'History +7'},{value:'inv',label:'Investigation +7'},{value:'nat',label:'Nature +7'},{value:'ins',label:'Insight +6'},{value:'prc',label:'Perception +6'},{value:'med',label:'Medicine / life support +7'}];
 if(action==='configure'){
  const fields=[...Array.from({length:3},(_,i)=>({name:'trait'+i,label:'Trait '+(i+1),options:[{value:'',label:'None'},...opts],value:traits[i]??''})),{name:'languages',label:'Up to four extra languages',value:(meta(item).docentLanguages??[]).join(', ')}];const d=await form('Docent Configuration',fields);if(!d)return false;
  const unique=[...new Set([d.trait0,d.trait1,d.trait2].filter(Boolean))];await updateMeta(item,{docentTraits:unique,docentLanguages:d.languages.split(',').map(s=>s.trim()).filter(Boolean).slice(0,4),configured:true});return true;
 }
 const chosen=await choose('Docent Assistance',traits.map(t=>opts.find(o=>o.value===t)));if(!chosen)return false;
 if(chosen==='detect-magic'||chosen==='detect-evil')return castSpell(actor,chosen==='detect-magic'?'Detect Magic':'Detect Evil and Good',{ability:'int',sourceItem:item});
 if(chosen==='scrying')return say(actor,'Docent','<p>The docent detects divination or scrying aimed at its host. The GM supplies what it perceives.</p>');
 const result=await roll(`1d20 + ${['ins','prc'].includes(chosen)?6:7}`,actor,'Docent: '+opts.find(o=>o.value===chosen).label);
 if(chosen==='med'&&actor.system.attributes.hp.value===0&&result.total>=10)await actor.update({'system.attributes.death.success':3});return true;
};
itemHandlers['wand-sheath']=async({actor,item})=>{
 const current=meta(item).wandUuid?await fromUuid(meta(item).wandUuid):null;
 if(current){await current.update({'system.attuned':false,'system.equipped':false,[`flags.${ID}.-=sheathedBy`]:null});await updateMeta(item,{wandUuid:null,extended:false});return true;}
 const opts=values(actor.items).filter(i=>i.id!==item.id&&(i.system.type?.value==='wand'||normalize(i.name).includes('wand'))&&!meta(i).sheathedBy);
 const id=await choose('Insert Wand',opts.map(i=>({value:i.id,label:i.name})));if(!id)return false;const wand=actor.items.get(id);
 await updateMeta(item,{wandUuid:wand.uuid,extended:false});await wand.update({[`flags.${ID}.sheathedBy`]:item.uuid,'system.equipped':false});return true;
};
itemHandlers['wand-toggle']=async({actor,item})=>{
 const wand=await fromUuid(meta(item).wandUuid??'');if(!wand)throw new Error('Insert a wand first.');const extend=!meta(item).extended;
 if(extend&&wand.system.attunement==='required'&&!wand.system.attuned)throw new Error('Attune to the wand before using it.');
 await updateMeta(item,{extended:extend});await wand.update({'system.equipped':extend});return true;
};
export function machineList(){return canvas.scene?.getFlag(ID,'machines')??[];}
export function machinesAt(token){if(!token)return[];return machineList().filter(m=>m.active&&Math.hypot(token.center.x-m.x,token.center.y-m.y)/canvas.scene.grid.size*canvas.scene.grid.distance<=m.radius);}
export async function setMachines(machines){requireGM();return canvas.scene.setFlag(ID,'machines',machines);}
itemHandlers['machine']=async({actor,item})=>{
 requireGM();const token=tokenFor(actor);if(!token)throw new Error('Place the machine’s token or controller on the scene.');
 const all=machineList(),old=all.find(m=>m.itemUuid===item.uuid);if(old){old.active=!old.active;await setMachines(all);return true;}
 const kind=meta(item).machine;const radius=kind==='spell-sink'?15840:kind==='masters-call'?5280:kind==='storm-spire'?528000:10560;
 all.push({id:foundry.utils.randomID(),kind,name:item.name,itemUuid:item.uuid,controller:actor.uuid,x:token.center.x,y:token.center.y,radius,active:true});await setMachines(all);return true;
};
itemHandlers['masters-call']=async({actor,item})=>{
 const target=targetActor(actor);if(!isWarforged(target))throw new Error('The target must be warforged.');
 const machine=machineList().find(m=>m.itemUuid===item.uuid&&m.active);if(!machine)throw new Error('Activate and place the machine first.');
 const caster=tokenFor(actor),victim=tokenFor(target);if(!caster||!victim)throw new Error('Both creatures must be on the scene.');
 const dist=t=>Math.hypot(t.center.x-machine.x,t.center.y-machine.y)/canvas.scene.grid.size*canvas.scene.grid.distance;
 if(dist(caster)>5||dist(victim)>52800)throw new Error('Touch the machine; the target must be within 10 miles.');
 const controlled=game.actors.filter(a=>actorEffects(a,m=>m.mastersCall===item.uuid).length);if(controlled.length>=8)throw new Error('Release an existing command before controlling a ninth warforged.');
 const d=await form("Master's Call",[{name:'command',label:'Command (up to 25 words)',type:'textarea'}]);if(!d)return false;if(d.command.trim().split(/\s+/).length>25)throw new Error('The message exceeds 25 words.');
 const dc=14+actor.system.abilities.int.mod;const saves=await target.rollSavingThrow({ability:'wis',target:dc});
 if(saves?.[0]?.total<dc)await makeEffect(target,"Master's Call",{seconds:28800,data:{mastersCall:item.uuid,command:d.command,controller:actor.uuid},origin:item.uuid});
 await say(actor,"Master's Call",`<p>${escape(target.name)} receives: ${escape(d.command)}</p><p>Wisdom save DC ${dc}; no concentration; ends when fulfilled, dismissed, or after eight hours.</p>`);return true;
};
itemHandlers['storm-weather']=async({actor,item})=>{
 const machine=machineList().find(m=>m.itemUuid===item.uuid&&m.active);if(!machine)throw new Error('Place and activate the spire first.');
 const choice=await choose('Storm Spire',['Sense / predict weather','Local weather (10-mile radius)','Distant control (10-minute ritual)']);if(!choice)return false;
 const d=await form('Weather Conditions',[{name:'conditions',label:'Desired conditions or GM forecast',type:'textarea'}]);if(!d)return false;
 if(choice.startsWith('Distant'))await makeEffect(actor,'Storm Spire: Distant Weather',{data:{concentration:true,stormSpire:item.uuid},origin:item.uuid});
 machine.weather={mode:choice,conditions:d.conditions,time:game.time.worldTime};await setMachines(machineList().map(m=>m.id===machine.id?machine:m));return say(actor,'Storm Spire',`<p>${escape(choice)}: ${escape(d.conditions)}</p>`);
};
export async function manageMachines(){requireGM();const list=machineList();const id=await choose('Eldritch Machines',list.map(m=>({value:m.id,label:m.name+' · '+(m.active?'active':'inactive')})));if(!id)return;const mode=await choose('Machine Control',['Toggle active','Remove placement','Show details']);if(!mode)return;const m=list.find(m=>m.id===id);if(mode==='Toggle active')m.active=!m.active;else if(mode==='Remove placement')list.splice(list.indexOf(m),1);else await say(null,m.name,`<p>Radius ${m.radius} feet. Controller: @UUID[${escape(m.controller)}]</p>`,{whisper:true});await setMachines(list);}
export async function craft(actor){
 requireOwner(actor);const d=await form('Wayfinder Crafting',[{name:'kind',label:'Task',options:[{value:'quote',label:'Calculate requirements'},{value:'schema',label:'Develop schema'},{value:'craft',label:'Create an item'}]},{name:'rarity',label:'Rarity',options:[{value:'common',label:'Common'},{value:'uncommon',label:'Uncommon'},{value:'rare',label:'Rare'},{value:'veryRare',label:'Very Rare'},{value:'legendary',label:'Legendary'}]},{name:'consumable',label:'Consumable',type:'checkbox'},{name:'focus',label:'Dragonmark focus item',type:'checkbox'},{name:'item',label:'Canonical item UUID (for delivery)'},{name:'skill',label:'Schema skill',options:[{value:'arc',label:'Arcana'},{value:'rel',label:'Religion'},{value:'nat',label:'Nature'}]},{name:'approved',label:'GM has approved the schema, rare component, tools and downtime',type:'checkbox'}]);if(!d)return;
 const c=craftingCost(d.rarity,{consumable:d.consumable,focus:d.focus});
 if(d.kind!=='quote'&&!d.approved)throw new Error('The printed crafting rules require the GM to approve these prerequisites.');
 if(d.kind==='schema'){
  const skill=actor.system.skills[d.skill];if(skill.total<c.minSkill)throw new Error('Your sustained skill bonus does not meet the schema requirement.');
  const schemas=meta(actor).schemas??[];schemas.push({itemUuid:d.item,rarity:d.rarity,days:c.schemaDays,created:game.time.worldTime});await actor.setFlag(ID,'schemas',schemas);
 }else if(d.kind==='craft'){
  const source=await fromUuid(d.item);if(!source||source.documentName!=='Item')throw new Error('Choose a canonical item entry.');
  const previousCurrency=foundry.utils.deepClone(actor._source.system.currency);const currency=payGold(actor.system.currency,c.gold);
  const data=source.toObject();delete data._id;delete data.folder;await actor.update({'system.currency':currency});
  try{await actor.createEmbeddedDocuments('Item',[data]);}catch(e){await actor.update({'system.currency':previousCurrency});throw e;}
 }
 await say(actor,'Crafting Requirements',`<p>Schema: ${c.schemaDays} workdays, sustained skill bonus +${c.minSkill}. Item: ${c.weeks} workweeks and ${c.gold.toLocaleString()} gp. Ingredient challenge: CR ${c.cr[0]}${c.cr[1]?'–'+c.cr[1]:'+'}.</p><p>Use the book’s printed costs. The legendary row is 20 workweeks in this supplied prototype.</p>`);
}
export async function magewright(actor){
 requireOwner(actor);const professions={Chef:['Prestidigitation','Purify Food and Drink','Gentle Repose'],Healer:['Spare the Dying','Detect Poison and Disease','Lesser Restoration'],Launderer:['Mending','Prestidigitation'],Lamplighter:['Light','Continual Flame'],Locksmith:['Arcane Lock','Knock'],Medium:['Speak with Dead','Minor Illusion'],Oracle:['Augury','Divination']};
 const job=await choose('Magewright Profession',Object.keys(professions));if(!job)return;
 const features=[];
 for(const name of professions[job]){
  const spell=await findSpell(name);if(!spell){ui.notifications.warn(name+' is not installed.');continue;}
  const existing=values(actor.items).find(i=>i.type==='spell'&&normalize(i.name)===normalize(name));if(existing)continue;
  const d=spell.toObject();delete d._id;delete d.folder;d.system.method='innate';d.system.prepared=2;d.flags??={};d.flags[ID]={magewright:true,profession:job};
  for(const a of Object.values(d.system.activities??{})){
   a.consumption??={};a.consumption.spellSlot=false;a.consumption.targets=[];
   if(spell.system.level>0){a.activation={type:'hour',value:1,override:true};a.flags??={};a.flags[ID]={magewrightCost:spell.system.level===1?25:50*2**Math.max(0,spell.system.level-2)};}
  }features.push(d);
 }
 if(features.length)await actor.createEmbeddedDocuments('Item',features);await actor.setFlag(ID,'magewright',job);
 await say(actor,'Magewright',`<p>${escape(job)} configured without spell slots. The printed narrow spell applications remain tied to this profession.</p>`);
}
