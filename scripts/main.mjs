import {ID,meta,values,normalize,canonicalKey,duplicateGroups,actorHas,actorMark,isWarforged,isEquipped,docReferences,payGold,currencyCopper} from './mechanics.mjs';
import {selectedActor,requireOwner,requireGM,choose,form,confirm,say,escape,roll,tokenFor,makeEffect,removeEffects,actorEffects,activeGM,safeRun} from './ui.mjs';
import {handlers} from './character-actions.mjs';
import {itemHandlers,craft,magewright,manageMachines,machinesAt,machineList} from './item-actions.mjs';
import {castSpell,findSpell,clearSpellIndex} from './spells.mjs';
import * as combat from './combat.mjs';
import './icons.mjs';
import * as environment from './environment.mjs';

const actions={...handlers,...itemHandlers};
const locks=new Map(),syncing=new Set();
let configuration=null,socket=null;
const path='modules/'+ID;
const ARTISAN=['alchemist','brewer','calligrapher','carpenter','cartographer','cobbler','cook','glassblower','jeweler','leatherworker','mason','painter','potter','smith','tinker','weaver','woodcarver'];
const MUSIC=['bagpipes','drum','dulcimer','flute','horn','lute','lyre','panflute','shawm','viol'];
const GAMES=['card','chess','dice'];
const HOUSES={Cannith:['alchemist','tinker'],Deneith:['game','land'],Ghallanda:['brewer','cook'],Jorasco:['alchemist','herb'],Kundarak:['tinker','thief'],Lyrandar:['water','air','navg'],Medani:['thief','disg'],Orien:['land','game'],Phiarlan:['disg','music'],Sivis:['calligrapher','forg'],Tharashk:['thief','game'],Thuranni:['pois','music'],Vadalis:['land','herb']};

actions['house-connections']=async({actor,item})=>{
 const action=await choose('House Connections',[{value:'house',label:'Choose house and its proficiencies'},{value:'equipment',label:'Claim starting equipment once'},{value:'favor',label:'Request house assistance'}]);if(!action)return false;
 if(action==='house'){
  const house=await choose('Dragonmarked House',Object.keys(HOUSES));if(!house)return false;
  const tools=[];for(const t of HOUSES[house]){
   if(['game','music'].includes(t)){const id=await choose(t==='game'?'Gaming Set':'Musical Instrument',(t==='game'?GAMES:MUSIC).map(k=>({value:k,label:CONFIG.DND5E.tools[k]?.label??k})));if(!id)return false;tools.push(id);}else tools.push(t);
  }
  const update={};for(const tool of tools)update[`system.tools.${tool}.value`]=Math.max(1,actor.system.tools?.[tool]?.value??0);
  await actor.update(update);await item.setFlag(ID,'house',house);await item.setFlag(ID,'configured',true);return true;
 }
 if(action==='equipment'){
  if(meta(item).equipmentClaimed)throw new Error('The starting equipment has already been claimed.');
  const docs=[];
  for(const name of ['Fine Clothes','Signet Ring','Identification Papers','Pouch']){
   let found=null;
   for(const pack of game.packs.filter(p=>p.documentName==='Item'&&p.visible)){
    const idx=await pack.getIndex({fields:['type','system.source.rules']});const e=idx.find(e=>normalize(e.name)===normalize(name)&&e.system?.source?.rules!=='2024');if(e){found=await pack.getDocument(e._id);break;}
   }
   if(found){const d=found.toObject();delete d._id;delete d.folder;docs.push(d);}else{
    docs.push({name,img:'icons/sundries/scrolls/scroll-yellow.webp',type:'loot',system:{quantity:1,description:{value:'House Agent starting equipment, WGtE p.94.'},type:{value:'gear'},source:{book:'WGtE',page:'94',rules:'2014'}},flags:{[ID]:{startingEquipment:true,sourceItemUuid:item.uuid}}});
   }
  }
  await actor.createEmbeddedDocuments('Item',docs);await actor.update({'system.currency.gp':Number(actor.system.currency.gp??0)+20});await item.setFlag(ID,'equipmentClaimed',true);return true;
 }
 const d=await form('Request House Assistance',[{name:'request',label:'Lodging, provisions, transport or other request',type:'textarea'},{name:'standing',label:'Current standing with your house'}]);if(!d)return false;await say(actor,'House Connections',`<p>${escape(meta(item).house??'House agent')}: ${escape(d.request)}</p><p>Standing: ${escape(d.standing)}. The GM determines the response of these contacts.</p>`);return true;
};
actions['gust-object']=async({actor,item})=>{
 const d=await form('Gust: Unattended Object',[{name:'object',label:'Unattended object (at most 5 lb)'},{name:'valid',label:'Object is within 30 feet and is not held or carried',type:'checkbox'}]);if(!d)return false;if(!d.valid)throw new Error('The object must satisfy the spell’s limits.');await say(actor,'Gust',`<p>${escape(d.object)} is pushed up to 10 feet away from the caster without enough force to deal damage.</p>`);return true;
};
actions['trait-save']=async({actor,activity})=>{
 const m=meta(activity);const ability=await choose('Saving Throw',Object.entries(CONFIG.DND5E.abilities).map(([key,v])=>({value:key,label:v.label})));if(!ability)return false;
 return actor.rollSavingThrow({ability,[ID]:{saveCondition:m.condition,isMagic:m.magic,contextKnown:true}});
};

function checkActivity(activity){
 const actor=requireOwner(activity.actor),item=activity.item,m=meta(item),am=meta(activity);
 if(m.requiredMark&&actorMark(actor)!==m.requiredMark)throw new Error('This item requires the Mark of '+m.requiredMark+'.');
 if(m.requiresGreaterMark&&!values(actor.items).some(i=>meta(i).greaterMark&&meta(i).configured))throw new Error('A Greater Dragonmark is required.');
 if(m.warforgedOnly&&!isWarforged(actor))throw new Error('This component requires a warforged.');
 if(am.minimumLevel&&actor.system.details.level<am.minimumLevel)throw new Error('This activity requires level '+am.minimumLevel+'.');
 if(['equipment','weapon','consumable'].includes(item.type)&&!['armblade','docent','imbued-wood','orb-material','shiftweave','wand-sheath'].includes(am.handler)){
  if(item.system.attunement==='required'&&!item.system.attuned)throw new Error('Attune to this item before using it.');
 }
 if(am.requiresShift&&!actorEffects(actor,e=>e.shifting).length)throw new Error('You must be shifted to use this activity.');
 if(am.oppositeBlade&&game.combat){const used=meta(actor).doubleBladeAttack;if(!used||used.combat!==game.combat.id||used.round!==game.combat.round||used.turn!==game.combat.turn)throw new Error('First use the Attack action with this double-bladed scimitar this turn.');}
 if(am.pounceBite){const target=[...game.user.targets][0]?.actor;if(!target?.statuses.has('prone')||meta(actor).pounceTarget!==target.uuid)throw new Error('Pounce Bite requires the creature knocked prone by this clawfoot’s pounce.');}
 if(m.sheathedBy){const sheath=fromUuidSync(m.sheathedBy);if(!meta(sheath).extended)throw new Error('Extend the sheathed wand before using it.');}
 const blocked=combat.magicBlocked(activity);if(blocked)throw new Error(blocked);
 return actor;
}
function resourcePlan(activity){
 return values(activity.consumption?.targets).map(t=>{
  if(t.type==='itemUses'){
   const item=t.target?activity.actor.items.get(t.target):activity.item;if(!item)throw new Error('The required resource item is missing.');const amount=Number(t.value??1),max=Number(item.system.uses.max),spent=Number(item.system.uses.spent??0);
   if(spent+amount>max)throw new Error('No uses remaining.');return {item,key:'system.uses.spent',spent,amount};
  }
  if(t.type==='activityUses'){
   const spent=Number(activity.uses.spent??0),amount=Number(t.value??1);if(spent+amount>Number(activity.uses.max))throw new Error('No activity uses remaining.');return {item:activity.item,key:`system.activities.${activity.id}.uses.spent`,spent,amount};
  }
  throw new Error('Unsupported custom activity resource: '+t.type);
 });
}
export async function executeActivity(activity,options={}){
 const actor=checkActivity(activity),item=actor.items.get(activity.item.id)??activity.item,handler=meta(activity).handler??(meta(activity).ritualOnly?'cast-spell':null);
 if(!handler||!actions[handler])throw new Error('Unknown Wayfinder activity: '+handler);
 if(locks.has(actor.uuid))return ui.notifications.warn('Finish the current Wayfinder action first.');
 const task=(async()=>{
  const reverting=handler==='shifting'&&actorEffects(actor,m=>m.shifting).length;
  const resources=reverting?[]:resourcePlan(activity);
  if(activity.activation.type==='reaction'&&game.combat&&globalThis.MidiQOL?.hasUsedReaction?.(actor))throw new Error('Your reaction is already spent.');
  const result=await actions[handler]({actor,item,activity,config:configuration,options});
  if(result===false||result===null)return false;
  for(const r of resources)await r.item.update({[r.key]:r.spent+r.amount});
  if(activity.activation.type==='reaction'&&game.combat)await globalThis.MidiQOL?.setReactionUsed?.(actor);
  if(activity.activation.type==='bonus'&&game.combat&&!reverting)await globalThis.MidiQOL?.setBonusActionUsed?.(actor);
  await syncActor(actor);return true;
 })();locks.set(actor.uuid,task);try{return await task;}finally{if(locks.get(actor.uuid)===task)locks.delete(actor.uuid);}
}

export async function syncActor(actor){
 if(!actor?.isOwner||syncing.has(actor.uuid))return;syncing.add(actor.uuid);
 try{
  const managed=actorEffects(actor,m=>m.derived),desired=[];
  const feat=values(actor.items).find(i=>meta(i).revenantBlade);
  const weapons=values(actor.items).filter(i=>meta(i).doubleBlade);
  if(feat&&weapons.some(w=>isEquipped(w))&&meta(feat).twoHanded!==false)desired.push({key:'revenant-ac',name:'Revenant Blade: +1 AC',changes:[['system.attributes.ac.bonus',1]],origin:feat.uuid});
  for(const weapon of weapons){
   const props=Array.from(weapon._source.system.properties??[]),has=props.includes('fin'),grant=!!feat&&isEquipped(weapon)&&meta(feat).twoHanded!==false;
   if(grant&&!has)await weapon.update({'system.properties':[...props,'fin'],[`flags.${ID}.revenantFinesse`]:true});
   if(!grant&&meta(weapon).revenantFinesse)await weapon.update({'system.properties':props.filter(p=>p!=='fin'),[`flags.${ID}.revenantFinesse`]:false});
  }
  for(const sheath of values(actor.items).filter(i=>meta(i).itemKind==='wand-sheath'&&isEquipped(i))){
   const wand=meta(sheath).wandUuid?await fromUuid(meta(sheath).wandUuid):null;
   if(wand?.system.attuned)desired.push({key:'sheath-credit:'+sheath.id,name:'Wand Sheath: Shared Attunement',changes:[['system.attributes.attunement.max',1]],origin:sheath.uuid});
  }
  for(const d of desired){
   if(!managed.some(e=>meta(e).derived===d.key))await makeEffect(actor,d.name,{changes:d.changes,data:{derived:d.key},origin:d.origin});
  }
  const obsolete=managed.filter(e=>!desired.some(d=>d.key===meta(e).derived));await removeEffects(actor,obsolete.map(e=>e.id));
 }finally{syncing.delete(actor.uuid);}
}

export async function configureItem(item=null){
 const actor=requireOwner(item?.actor??selectedActor());
 if(!item){const id=await choose('Wayfinder Item',values(actor.items).filter(i=>meta(i).key).map(i=>({value:i.id,label:i.name})));if(!id)return;item=actor.items.get(id);}
 const choices=values(item.system.activities).filter(a=>meta(a).handler).map(a=>({value:a.id,label:a.name}));
 if(!choices.length)return say(actor,item.name,'<p>This entry uses native advancements or passive rules.</p>');
 const id=await choose(item.name,choices);if(id)await executeActivity(item.system.activities.get(id));
}
export async function configureActor(actor=selectedActor()){
 requireOwner(actor);const candidates=values(actor.items).filter(i=>meta(i).key||meta(i).ancestry);
 const option=await choose('Wayfinder Character',[{value:'feature',label:'Use or configure a feature or item'},{value:'passives',label:'Refresh passive equipment effects'},{value:'duplicates',label:'Inspect duplicate character entries'},{value:'focus',label:'Optional two-handed focus rule'}]);if(!option)return;
 if(option==='feature'){const id=await choose('Wayfinder Item',candidates.map(i=>({value:i.id,label:i.name})));return id?configureItem(actor.items.get(id)):false;}
 if(option==='passives')return syncActor(actor);
 if(option==='duplicates')return showDuplicates(values(actor.items),actor);
 if(option==='focus'){
  const d=await form('Two-Handed Arcane Focus',[{name:'enabled',label:'DM permits the optional rule',type:'checkbox',value:meta(actor).twoHandFocus},{name:'held',label:'Currently using the focus with two hands',type:'checkbox',value:meta(actor).twoHandFocusHeld}]);if(!d)return;await actor.setFlag(ID,'twoHandFocus',d.enabled);await actor.setFlag(ID,'twoHandFocusHeld',d.held);
 }
}
async function showDuplicates(docs,actor=null){
 const groups=duplicateGroups(docs);await say(actor,'Shared Content Audit',groups.length?'<ul>'+groups.map(g=>`<li>${escape(g.key)}<ul>${g.entries.map(e=>`<li>${e.uuid?'@UUID['+escape(e.uuid)+']':escape(e.name)}</li>`).join('')}</ul></li>`).join('')+'</ul>':'<p>No duplicate canonical entries found.</p>',{whisper:true});return groups;
}
export async function checkDuplicates(){
 const docs=[];
 for(const p of game.packs.filter(p=>['Item','Actor'].includes(p.documentName)&&p.visible)){
  const idx=await p.getIndex({fields:['type','system.source.rules',`flags.${ID}.canonicalKey`]});
  for(const e of idx)if(e.system?.source?.rules!=='2024')docs.push({...e,uuid:p.getUuid(e._id)});
 }
 return showDuplicates(docs,selectedActor());
}
export async function openBook(){const pack=game.packs.get(ID+'.reference'),idx=await pack.getIndex(),e=idx.find(e=>e.name.startsWith('Start Here'));const d=await pack.getDocument(e._id);d.sheet.render(true);}
export async function story(){requireGM();const pack=game.packs.get(ID+'.tables'),docs=await pack.getDocuments();const picked=docs.filter(d=>d.name.startsWith('Sharn Story'));for(const d of picked)await d.draw();}
export async function validateInstalled(){
 requireGM();let documents=0;const errors=[];
 for(const p of game.packs.filter(p=>p.metadata.packageName===ID||p.collection.startsWith(ID+'.'))){
  try{for(const d of await p.getDocuments()){documents++;try{d.validate({strict:true});}catch(e){errors.push(d.name+': '+e.message);}for(const uuid of docReferences(d.toObject()))try{if(!await fromUuid(uuid))errors.push(d.name+': missing '+uuid);}catch(e){errors.push(d.name+': unresolved '+uuid);}}}catch(e){errors.push(p.collection+': '+e.message);}
 }
 await say(null,'Installed Wayfinder Validation',`<p>${documents} documents inspected. ${errors.length} problem(s).</p><ul>${errors.map(e=>'<li>'+escape(e)+'</li>').join('')}</ul>`,{whisper:true});return {documents,errors};
}
function preUse(activity,usage){
 try{
  const blocked=combat.magicBlocked(activity);if(blocked)throw new Error(blocked);
  const a=activity.actor,range=activity.range;
  if(activity.item.type==='spell'&&activity.item.system.level===0&&['attack','save'].includes(activity.type)&&meta(a).twoHandFocus&&meta(a).twoHandFocusHeld&&range.units==='ft'&&Number(range.value)>0){activity.updateSource({'range.value':Number(range.value)*1.5,'range.override':true});}
  if(!meta(activity.item).key&&!meta(activity).handler&&!meta(activity.item).magewright)return;
  checkActivity(activity);
  if(meta(activity).handler||meta(activity).ritualOnly){safeRun(executeActivity)(activity);return false;}
  const cost=meta(activity).magewrightCost;if(cost&&currencyCopper(activity.actor.system.currency)<cost*100)throw new Error('Insufficient gold for the magewright ritual.');
 }catch(e){ui.notifications.warn(e.message);return false;}
}

export function magewrightConsumption(activity,usage,message,updates){
 const cost=meta(activity).magewrightCost;if(!cost)return;
 try{updates.actor??={};updates.actor['system.currency']=payGold(activity.actor.system.currency,cost);}catch(e){ui.notifications.warn(e.message);return false;}
}

function preCreateItem(item,data,options){
 const m=meta(data);if(!m.key||!item.parent||options[ID]?.temporary||m.serviceCast)return;
 if(['class','subclass','feat','spell'].includes(item.type)){
  const same=values(item.parent.items).find(i=>canonicalKey(i)===canonicalKey(data));if(same){ui.notifications.info(`${same.name} is already on this character; a duplicate was skipped.`);return false;}
 }
}
function preUpdateItem(item,changes){
 if(!item.actor)return;
 if(meta(item).itemKind==='rings-of-shared-suffering'&&foundry.utils.getProperty(changes,'system.attuned')===true&&values(item.actor.items).some(i=>i.id!==item.id&&meta(i).itemKind==='rings-of-shared-suffering'&&i.system.attuned)){ui.notifications.warn('Only one ring of shared suffering may be attuned.');return false;}
}
function preUpdateActor(actor,changes){
 const hp=foundry.utils.getProperty(changes,'system.attributes.hp.value');
 if(hp===0&&actor.system.attributes.hp.value>0&&values(actor.items).some(i=>meta(i).deathAtZero&&isEquipped(i))){foundry.utils.setProperty(changes,'system.attributes.death.failure',3);foundry.utils.setProperty(changes,'system.attributes.death.success',0);foundry.utils.setProperty(changes,`flags.${ID}.loyaltyDeath`,true);}
}

async function updateActor(actor,changes,options,userId){
 if(userId!==game.user.id&&!activeGM())return;
 if(meta(actor).loyaltyDeath&&actor.system.attributes.hp.value===0&&!actor.statuses.has('dead'))await actor.toggleStatusEffect('dead',{active:true});
 if(actor.system.attributes.hp.value===0&&actorHas(actor,'changeling:appearance')){
  const item=values(actor.items).find(i=>meta(i).key==='changeling:appearance'),natural=meta(item).naturalAppearance;
  if(actor.statuses.has('dead')&&natural&&meta(item).changedAppearance){await actor.update({name:natural.name,img:natural.img});await item.setFlag(ID,'changedAppearance',false);const token=tokenFor(actor);if(token)await token.document.update({'texture.src':natural.tokenImg,name:natural.name});}
 }
}
async function afterRest(actor,data){
 if(!actor.isOwner)return;
 if(data.longRest){
  for(const item of actor.items){if(meta(item).scentTarget)await item.setFlag(ID,'scentTarget',null);}
  const protection=values(actor.items).find(i=>meta(i).key==='warforged:protection');
  if(protection)await actions['integrated-protection']({actor,item:protection});
 }
 await syncActor(actor);
}
async function cleanupDeletedItem(item,options,userId){
 if(!item.actor||userId!==game.user.id)return;const actor=item.actor;
 const originEffects=actorEffects(actor,(_m,e)=>e.origin===item.uuid);await removeEffects(actor,originEffects.map(e=>e.id));
 if(meta(item).key==='warforged:protection'&&meta(item).previousAC&&actor.system.attributes.ac.formula===meta(item).managedAC)await actor.update({'system.attributes.ac':meta(item).previousAC});
 if(meta(item).greaterMark&&meta(item).abilityIncrease){const ab=meta(item).abilityIncrease;await actor.update({[`system.abilities.${ab}.value`]:Math.max(1,actor._source.system.abilities[ab].value-1)});}
 const spells=values(actor.items).filter(i=>meta(i).grantedSpell&&meta(i).sourceItemUuid===item.uuid);if(spells.length)await actor.deleteEmbeddedDocuments('Item',spells.map(i=>i.id));await syncActor(actor);
}
function installWrappers(){
 if(!globalThis.libWrapper)return;
 libWrapper.register(ID,'CONFIG.Actor.documentClass.prototype.applyDamage',async function(wrapped,...args){const result=await wrapped(...args);await combat.waitForDamage(this.uuid);return result;},'WRAPPER');
 libWrapper.register(ID,'CONFIG.Actor.documentClass.prototype.rollSavingThrow',async function(wrapped,config={},dialog={},message={}){
  if(!values(this.items).some(i=>meta(i).key))return wrapped(config,dialog,message);
  const dualMind=config.ability==='wis'&&actorHas(this,'kalashtar:dual-mind')&&!globalThis.MidiQOL?.hasUsedReaction?.(this);
  const needsContext=actorHas(this,'warforged:resilience')||actorHas(this,'base:dwarven-resilience')||actorHas(this,'base:fey-ancestry')||actorHas(this,'base:brave')||actorHas(this,'base:gnome-cunning');
  let useDual=false;
  if(!config[ID]?.contextKnown&&(needsContext||dualMind)){
   const fields=[{name:'condition',label:'Effect being saved against',options:[{value:'',label:'Other / none of these'},{value:'poison',label:'Poison'},{value:'charmed',label:'Charmed'},{value:'frightened',label:'Frightened'}]},{name:'magic',label:'Magical spell or effect',type:'checkbox'}];if(dualMind)fields.push({name:'dual',label:'Use Dual Mind reaction for advantage',type:'checkbox'});
   const d=await form('Saving Throw Context',fields);if(!d)return null;config[ID]={...config[ID],contextKnown:true,saveCondition:d.condition,isMagic:d.magic};useDual=!!d.dual;if(useDual)config.advantage=true;
  }
  const rolls=await wrapped(config,dialog,message);if(useDual&&rolls?.length)await globalThis.MidiQOL?.setReactionUsed?.(this);return rolls;
 },'WRAPPER');
}

Hooks.once('init',()=>{
 const api={configureActor,configureItem,checkDuplicates,openBook,story,craft:()=>craft(selectedActor()),magewright:()=>magewright(selectedActor()),manageMachines,manageWind:environment.manageWind,resolveFall:()=>environment.resolveFall(selectedActor()),validateInstalled,executeActivity,lookupCanonical:async(type,name)=>{
  for(const p of game.packs.filter(p=>p.documentName==='Item'&&p.visible)){const i=await p.getIndex({fields:['type','system.source.rules']});const e=i.find(e=>e.type===type&&normalize(e.name)===normalize(name)&&e.system?.source?.rules!=='2024');if(e)return p.getUuid(e._id);}return null;
 }};
 game.modules.get(ID).api=api;combat.setExecutor(executeActivity);
 Hooks.on('dnd5e.preUseActivity',preUse);Hooks.on('dnd5e.activityConsumption',magewrightConsumption);Hooks.on('preCreateItem',preCreateItem);Hooks.on('preUpdateItem',preUpdateItem);Hooks.on('preUpdateActor',preUpdateActor);
 Hooks.on('dnd5e.preRollSkillV2',config=>combat.addRollRules(config,'skill'));
 Hooks.on('dnd5e.preRollToolV2',config=>combat.addRollRules(config,'tool'));
 Hooks.on('dnd5e.preRollAbilityCheckV2',config=>{if(!config.skill&&!config.tool)combat.addRollRules(config,'ability');});
 Hooks.on('dnd5e.preRollSavingThrowV2',config=>combat.addRollRules(config,'save'));
 Hooks.on('dnd5e.preRollInitiativeDialogV2',config=>combat.addRollRules(config,'initiative'));
 Hooks.on('dnd5e.preRollDamageV2',combat.damageRollRules);
 Hooks.on('dnd5e.rollSkill',safeRun(combat.afterCheck));Hooks.on('dnd5e.rollToolCheck',safeRun(combat.afterCheck));Hooks.on('dnd5e.rollSavingThrow',safeRun(combat.afterSave));
 Hooks.on('dnd5e.preCalculateDamage',combat.captureDamage);Hooks.on('dnd5e.preApplyDamage',combat.preApplyDamage);
 Hooks.on('preUpdateToken',combat.movementBefore);Hooks.on('preUpdateToken',environment.preDuelMovement);Hooks.on('updateToken',safeRun(environment.tokenMoved));Hooks.on('midi-qol.preAttackRoll',combat.beforeAttack);Hooks.on('midi-qol.RollComplete',safeRun(combat.workflowFinished));Hooks.on('midi-qol.preAttackRollConfig',combat.afterAttackConfiguration);Hooks.on('midi-qol.preAttackRollConfig',environment.windAttackRules);Hooks.on('midi-qol.RollComplete',safeRun(environment.endDuelOnAction));Hooks.on('midi-qol.preCheckHits',combat.quarryCover);
 Hooks.on('updateCombat',safeRun(combat.cleanupCombat));Hooks.on('updateCombat',safeRun(environment.windTurn));Hooks.on('updateCombat',safeRun(environment.endDuelOnTurn));Hooks.on('updateCombat',safeRun(environment.processReanimations));Hooks.on('updateWorldTime',safeRun(combat.worldTimeCleanup));Hooks.on('updateWorldTime',safeRun(environment.processReanimations));Hooks.on('updateScene',safeRun(environment.syncSuppression));Hooks.on('updateActor',safeRun(updateActor));Hooks.on('updateActor',safeRun(environment.queueReanimation));Hooks.on('dnd5e.endConcentration',safeRun(environment.cleanupConcentration));Hooks.on('deleteActiveEffect',safeRun(environment.notifyFriendsEnded));Hooks.on('dnd5e.restCompleted',safeRun(afterRest));
 Hooks.on('createItem',(i,_o,user)=>{if(i.actor&&user===game.user.id)safeRun(syncActor)(i.actor);});
 Hooks.on('updateItem',(i,_c,_o,user)=>{if(i.actor&&user===game.user.id)safeRun(syncActor)(i.actor);clearSpellIndex();});
 Hooks.on('deleteItem',safeRun(cleanupDeletedItem));
 game.settings.register(ID,'showWelcome',{name:'Show setup reminder',scope:'client',config:true,type:Boolean,default:true});
});
Hooks.once('socketlib.ready',()=>{
 socket=socketlib.registerModule(ID);socket.register('applyTransfer',combat.applyTransfer);socket.register('promptReaction',combat.promptReaction);combat.setSocket(socket);
});
Hooks.once('setup',installWrappers);
Hooks.once('ready',async()=>{
 configuration=await fetch(path+'/content/mark-config.json').then(r=>{if(!r.ok)throw new Error('Wayfinder configuration is missing.');return r.json();});
 for(const actor of game.actors.filter(a=>a.isOwner))await syncActor(actor);await environment.syncSuppression();
 if(game.user.isGM&&game.settings.get(ID,'showWelcome'))ui.notifications.info('Wayfinder: use the Setup & Automation macro compendium to configure character and item choices.');
 Hooks.callAll('telyBookContentRegistry',game.modules.get(ID).api);
});
