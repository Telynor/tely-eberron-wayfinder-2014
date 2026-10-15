import {ID,meta,values,actorHas,actorMark,isEquipped,intuitionFor,splitSharedDamage,reduceTypedDamage,normalize,sizeAtMost,isWarforged} from './mechanics.mjs';
import {roll,say,escape,makeEffect,removeEffects,actorEffects,tokenFor,distance,confirm,activeGM,safeRun} from './ui.mjs';
import {machinesAt,machineList} from './item-actions.mjs';
import {sceneActors} from './environment.mjs';

const pendingDamage=new Map(),movement=new Map(),processed=new Set(),transfersInFlight=new Set();
let socket=null,executor=null;
export function setExecutor(fn){executor=fn;}
export function setSocket(s){socket=s;}
export function addRollRules(config,kind){
 const actor=config.subject?.actor??config.subject;if(!actor?.items)return;
 config[ID]??={};if(config[ID].rollDecorated)return;config[ID].rollDecorated=true;
 const skill=kind==='skill'?config.skill:null,tool=kind==='tool'?config.tool:null;
 const context=config[ID]?.intuitionContext??false;
 const intuition=intuitionFor(actor,{skill,tool,initiative:kind==='initiative',context});
 if(intuition){config.rolls??=[{}];config.rolls[0]??={};config.rolls[0].parts??=[];config.rolls[0].parts.push(`${config[ID].trackingQuarry?'2 * ':''}1d${intuition.die}[Intuition]`);}
 const effects=actorEffects(actor,()=>true);
 if(skill==='ste'&&values(actor.items).some(i=>meta(i).protectionMode==='heavy')){config.disadvantage=true;for(const r of config.rolls??[]){r.options??={};r.options.disadvantage=true;}}
 const advantage=()=>{config.advantage=true;for(const r of config.rolls??[]){r.options??={};r.options.advantage=true;}};
 if(skill&&values(actor.items).some(i=>meta(i).glamourSkill===skill))advantage();
 if(config[ID].wardThreat&&['ins','prc'].includes(skill))advantage();
 if(config.ability==='wis'&&effects.some(e=>meta(e).shifterSubrace==='wildhunt')&&kind!=='save')advantage();
 if(kind==='save'&&config.ability==='wis'&&effects.some(e=>meta(e).dualMind))advantage();
 if(effects.some(e=>meta(e).oneCheck)&&kind!=='save')advantage();
 const target=[...game.user.targets][0]?.actor;
 if(config.ability==='cha'&&isWarforged(target)&&machinesAt(tokenFor(actor)).some(m=>m.kind==='masters-call'&&m.controller===actor.uuid&&values(actor.items).some(i=>i.uuid===m.itemUuid&&i.system.attuned)))advantage();
 if(target&&config.ability==='cha'&&effects.some(e=>meta(e).friendsTarget===target.uuid))advantage();
 for(const item of actor.items){
  const m=meta(item);
  if(tool&&((m.personaActive&&m.personaTool===tool)||m.integratedTool===tool)){
   const current=actor.system.tools?.[tool]?.value??0;const extra=Math.max(0,2-current)*actor.system.attributes.prof;
   if(extra){config.rolls??=[{}];config.rolls[0].parts??=[];config.rolls[0].parts.push(String(extra)+'[Doubled proficiency]');}
  }
  if((m.key==='shifter:wildhunt'&&m.scentTarget&&config[ID].scentTracking||m.stonecunning&&skill==='his'&&config[ID].stonework)&&kind!=='save'){
   const current=skill?actor.system.skills[skill]?.value??0:tool?actor.system.tools[tool]?.value??0:0;const extra=Math.max(0,2-current)*actor.system.attributes.prof;
   if(extra){config.rolls??=[{}];config.rolls[0].parts??=[];config.rolls[0].parts.push(String(extra)+'[Marked scent]');}
  }
 }
 if(kind==='save'){
  const cond=config[ID].saveCondition??'';const magic=config[ID].isMagic??false;
  if(cond==='poison'&&(actorHas(actor,'warforged:resilience')||actorHas(actor,'base:dwarven-resilience')))advantage();
  if(cond==='charmed'&&actorHas(actor,'base:fey-ancestry'))advantage();
  if(cond==='frightened'&&actorHas(actor,'base:brave'))advantage();
  if(magic&&['int','wis','cha'].includes(config.ability)&&actorHas(actor,'base:gnome-cunning'))advantage();
 }
}
export async function afterCheck(rolls,{subject}={}){
 if(!rolls?.length||!subject)return;
 const ids=actorEffects(subject,m=>m.oneCheck).map(e=>e.id);await removeEffects(subject,ids);
}
export async function afterSave(rolls,{subject,ability}={}){
 if(!rolls?.length||ability!=='wis'||!subject)return;
 await removeEffects(subject,actorEffects(subject,m=>m.dualMind).map(e=>e.id));
}
export function damageRollRules(config){
 const activity=config.subject,actor=activity?.actor;if(!actor)return;
 if(activity.item?.type==='spell'){
  const focuses=values(actor.items).filter(i=>meta(i).focusTypes&&isEquipped(i));
  for(const rr of config.rolls??[]){
   const type=rr.options?.type??rr.options?.damageType;
   const applicable=focuses.filter(f=>meta(f).focusTypes.includes(type));
   if(applicable.length){rr.parts??=[];rr.parts.push('1[Imbued wood]');break;}
  }
 }
 if(meta(activity).oppositeBlade&&actorHas(actor,'feat:revenant-blade')){
  const rr=config.rolls?.[0];if(rr?.parts)rr.parts=rr.parts.map(p=>String(p).replace(/\b1d4\b/,'2d4'));
 }
}
export function captureDamage(actor,damages,options){
 if(options[ID]?.skip)return;
 options[ID]??={};options[ID].rawDamage=foundry.utils.deepClone(damages);
}
export function preApplyDamage(actor,amount,updates,options={}){
 if(amount<=0||options[ID]?.skip)return;
 const raw=options[ID]?.rawDamage;
 const orb=raw&&values(actor.items).find(i=>meta(i).orbTypes&&isEquipped(i)&&raw.some(d=>d.value>0&&meta(i).orbTypes.includes(d.type)));
 const shared=actorEffects(actor,m=>m.protectedByRing)[0];
 const bladeWard=actorEffects(actor,m=>m.bladeWard)[0];
 if(!orb&&!shared&&!bladeWard)return;
 const previous=pendingDamage.get(actor.uuid)??Promise.resolve();
 const task=previous.catch(()=>{}).then(()=>resolveDamage(actor,amount,updates,options,{orb,shared,bladeWard}));
 pendingDamage.set(actor.uuid,task);task.catch(e=>{console.error(ID,e);ui.notifications.error(e.message);}).finally(()=>{if(pendingDamage.get(actor.uuid)===task)pendingDamage.delete(actor.uuid);});
 return false;
}
async function resolveDamage(actor,amount,updates,options,{orb,shared,bladeWard}){
 let applied=false;try{
 let modified=foundry.utils.deepClone(options[ID]?.rawDamage??[]),remaining=amount;
 if(orb){const r=await roll('1d4',actor,'Orb of Shielding');modified=reduceTypedDamage(modified,meta(orb).orbTypes,r.total);}
 if(bladeWard&&modified.length){
  let weapon=options.midi?.itemType==='weapon';
  if(!weapon)weapon=await confirm('Blade Ward','Is this bludgeoning, piercing or slashing damage from a weapon attack?');
  if(weapon){
   const resistance=new Set(actor.system.traits.dr.value??[]);
   modified=modified.map(d=>['bludgeoning','piercing','slashing'].includes(d.type)&&!resistance.has(d.type)?{...d,value:Math.floor(d.value/2)}:d);
  }
 }
 if(modified.length)remaining=Math.max(0,actor.calculateDamage(modified,{...options,[ID]:{skip:true}}).amount);
 let transfer=null;
 if(shared){
  const ring=await fromUuid(meta(shared).protectedByRing),partner=await fromUuid(meta(shared).pairedRing??'');
  if(ring&&partner&&ring.system.equipped&&ring.system.attuned&&partner.system.equipped&&partner.system.attuned&&meta(ring).protectedActor===actor.uuid){
   if(isEquipped(ring)&&isEquipped(partner)){const split=splitSharedDamage(remaining);remaining=split.protectedDamage;transfer={actor:ring.actor,amount:split.transferredDamage,ring};}
  }else await removeEffects(actor,[shared.id]);
 }
 const hp=actor.system.attributes.hp,temp=Math.max(0,hp.temp??0),tempDamage=Math.min(temp,remaining),hpDamage=Math.min(hp.value,remaining-tempDamage);
 await actor.update({'system.attributes.hp.value':Math.max(0,hp.value-hpDamage),'system.attributes.hp.temp':Math.max(0,temp-tempDamage)},{[ID]:{damageResolved:true}});
 applied=true;Hooks.callAll('dnd5e.applyDamage',actor,remaining,{...options,[ID]:{skip:true}});
 if(transfer?.amount){
  const nonce=foundry.utils.randomID();await actor.setFlag(ID,'pendingTransfer',{nonce,amount:transfer.amount,recipient:transfer.actor.uuid,ring:transfer.ring.uuid,userId:game.user.id,spent:false});
  if(game.user.isGM)await applyTransfer({sourceUuid:actor.uuid,nonce});
  else if(socket)await socket.executeAsGM('applyTransfer',{sourceUuid:actor.uuid,nonce});
  else throw new Error('A connected GM is required to transfer shared damage.');
 }
 await say(actor,'Wayfinder Damage',`<p>${remaining} damage applied${transfer?`; ${transfer.amount} transferred through the linked ring`:''}.</p>`);
 }catch(e){if(!applied){await actor.update(updates);Hooks.callAll('dnd5e.applyDamage',actor,amount,{...options,[ID]:{skip:true,fallback:true}});}throw e;}
}
export async function applyTransfer({sourceUuid,nonce}){
 const source=await fromUuid(sourceUuid),pending=meta(source).pendingTransfer;
 if(!pending||pending.nonce!==nonce||pending.spent||transfersInFlight.has(nonce))return false;
 const ring=await fromUuid(pending.ring),recipient=await fromUuid(pending.recipient),user=game.users.get(pending.userId);
 if(!ring||!recipient||ring.actor?.uuid!==recipient.uuid||!isEquipped(ring)||meta(ring).protectedActor!==source.uuid||!user||!source.testUserPermission(user,'OWNER'))return false;
 transfersInFlight.add(nonce);
 try{await recipient.applyDamage([{type:'none',value:Math.max(0,pending.amount),properties:new Set()}],{ignore:true,[ID]:{skip:true,transferred:true}});await source.setFlag(ID,'pendingTransfer',{...pending,spent:true});return true;}finally{transfersInFlight.delete(nonce);}
}
export function movementBefore(token,changes,options){
 if(changes.x==null&&changes.y==null)return;
 const actor=token.actor;if(!actor)return;
 if(meta(actor).key!=='creature:clawfoot-raptor')return;
 const old=movement.get(token.uuid)??{distance:0,angle:null,straight:true,round:game.combat?.round,turn:game.combat?.turn};
 const dx=(changes.x??token.x)-token.x,dy=(changes.y??token.y)-token.y;
 if(options[ID]?.teleport){movement.set(token.uuid,{distance:0,angle:null,straight:true});return;}
 const angle=Math.atan2(dy,dx),diff=old.angle==null?0:Math.abs(Math.atan2(Math.sin(angle-old.angle),Math.cos(angle-old.angle)));
 movement.set(token.uuid,{...old,distance:old.distance+Math.hypot(dx,dy)/canvas.scene.grid.size*canvas.scene.grid.distance,angle,straight:old.straight&&diff<0.15});
}
export async function workflowFinished(workflow){
 const key=workflow.id??workflow.uuid;if(processed.has(key))return;processed.add(key);if(processed.size>200)processed.delete(processed.values().next().value);
 const activity=workflow.activity??workflow.item?.system.activities?.contents?.[0];if(!activity)return;
 if(meta(workflow.item).doubleBlade&&activity.activation.type==='action'&&game.combat&&workflow.actor.isOwner)await workflow.actor.setFlag(ID,'doubleBladeAttack',{combat:game.combat.id,round:game.combat.round,turn:game.combat.turn});
 if(meta(workflow.item).clawAttack){
  const token=workflow.token,move=movement.get(token?.document?.uuid);
  if(move?.distance>=30&&move.straight&&workflow.hitTargets?.size){
   const pounce=values(workflow.actor.items).find(i=>meta(i).pounce);
   for(const target of workflow.hitTargets){
    if(!await confirm('Clawfoot Pounce',`Did the clawfoot move at least 30 feet straight toward ${target.name} before this hit?`))continue;
    const saves=await target.actor.rollSavingThrow({ability:'str',target:13});
    if(saves?.length&&saves[0].total<13){await makeEffect(target.actor,'Prone',{statuses:['prone'],data:{pouncedBy:workflow.actor.uuid},origin:pounce?.uuid});await workflow.actor.setFlag(ID,'pounceTarget',target.actor.uuid);}
   }
  }
 }
 if(meta(activity).pushDistance&&workflow.failedSaves?.size){
  for(const target of workflow.failedSaves){
   if(!sizeAtMost(target.actor.system.traits.size,meta(activity).maxSize??'grg'))continue;
   await pushAway(target,workflow.token,meta(activity).pushDistance);
  }
 }
}
export async function pushAway(target,source,feet){
 if(!target||!source)return;
 if(game.user.isGM||target.document.isOwner){
  const dx=target.center.x-source.center.x,dy=target.center.y-source.center.y,len=Math.hypot(dx,dy)||1,pixels=feet/canvas.scene.grid.distance*canvas.scene.grid.size;
  const point={x:target.center.x+dx/len*pixels,y:target.center.y+dy/len*pixels};
  if(target.checkCollision?.(point,{origin:target.center,type:'move',mode:'any'}))return ui.notifications.warn('A wall blocks this forced movement.');
  await target.document.update({x:point.x-target.w/2,y:point.y-target.h/2});
 }else if(globalThis.MidiQOL?.socket)await MidiQOL.socket().executeAsGM('moveTokenAwayFromPoint',{targetUuid:target.document.uuid,point:source.center,distance:feet,options:{animate:true,ignoreWalls:false,ignoreTokens:false}});
}
export async function beforeAttack(workflow){
 if(!workflow.targets?.size)return;
 for(const target of [...workflow.targets]){
  const actor=target.actor;if(!actor)continue;
  const visage=values(actor.items).find(i=>meta(i).key==='changeling:visage'&&Number(i.system.uses.spent??0)<1);
  const existing=actorEffects(actor,m=>m.unsettlingVisage)[0];
  if(existing){(workflow[ID]??={}).disadvantage=true;await removeEffects(actor,[existing.id]);}
  else if(visage&&!globalThis.MidiQOL?.hasUsedReaction?.(actor)){
   const owner=game.users.find(u=>u.active&&!u.isGM&&actor.testUserPermission(u,'OWNER'))??game.users.activeGM;
   const accepted=owner?.id===game.user.id?await promptReaction({actorUuid:actor.uuid,itemUuid:visage.uuid}):socket&&owner?await socket.executeAsUser('promptReaction',owner.id,{actorUuid:actor.uuid,itemUuid:visage.uuid}):false;
   if(accepted)(workflow[ID]??={}).disadvantage=true;
  }
  const duel=actorEffects(workflow.actor,m=>m.duelSource)[0];if(duel&&meta(duel).duelSource!==actor.uuid)(workflow[ID]??={}).disadvantage=true;
  const warding=sceneActors().filter(a=>values(a.items).some(i=>meta(i).ward===actor.uuid));
  for(const guardian of warding){
   const feature=values(guardian.items).find(i=>meta(i).ward===actor.uuid);const a=tokenFor(guardian);if(!a||distance(a,target)>5||MidiQOL.hasUsedReaction?.(guardian))continue;
   const owner=game.users.find(u=>u.active&&!u.isGM&&guardian.testUserPermission(u,'OWNER'))??game.users.activeGM;
   const accepted=owner?.id===game.user.id?await promptReaction({actorUuid:guardian.uuid,itemUuid:feature.uuid,guardian:true}):socket&&owner?await socket.executeAsUser('promptReaction',owner.id,{actorUuid:guardian.uuid,itemUuid:feature.uuid,guardian:true}):false;
   if(accepted){workflow.targets.delete(target);workflow.targets.add(a);}
  }
 }
}
export async function promptReaction({actorUuid,itemUuid,guardian=false}){
 const actor=await fromUuid(actorUuid),item=await fromUuid(itemUuid);if(!actor?.isOwner||item?.actor?.uuid!==actorUuid||MidiQOL.hasUsedReaction?.(actor))return false;
 if(!await confirm(guardian?'Vigilant Guardian':'Unsettling Visage',guardian?'Use your reaction to swap with your ward and become the attack’s target?':'Use your reaction to impose disadvantage before the attack is rolled?'))return false;
 const activity=values(item.system.activities).find(a=>meta(a).handler===(guardian?'guardian-swap':'unsettling-visage'));if(!activity)return false;
 const result=await executor(activity,{automaticReaction:true});
 if(result&&!guardian)await removeEffects(actor,actorEffects(actor,m=>m.unsettlingVisage).map(e=>e.id));return !!result;
}
export function magicBlocked(activity){
 const token=tokenFor(activity.actor);if(!token)return null;
 const magical=activity.item.type==='spell'||activity.type==='cast'||activity.item.system.properties?.has?.('mgc')||meta(activity.item).itemKind&&meta(activity.item).itemKind!=='armblade'||['cast-spell','greater-cast','aberrant-cast','aberrant-cantrip','shared-passage','spellsmith'].includes(meta(activity).handler);if(!magical)return null;
 for(const machine of machinesAt(token)){
  if(machine.kind==='spell-sink')return 'The active Spell Sink negates magic here.';
  if(machine.kind==='dimensional-seal'&&(activity.item.system.school==='con'||/teleport|dimension|plane shift|summon|gate/.test(normalize(activity.item.name))))return 'The Dimensional Seal blocks conjuration and planar travel here.';
 }
 return null;
}
export async function cleanupCombat(combat,changes){
 if(!activeGM()||!('turn'in changes||'round'in changes))return;
 movement.clear();processed.clear();const actor=combat.combatant?.actor;
 const actors=new Map([...game.actors,...canvas.tokens.placeables.map(t=>t.actor).filter(Boolean)].map(a=>[a.uuid,a]));
 for(const a of actors.values()){
  const expired=actorEffects(a,(m,e)=>{
   if(e.duration?.seconds&&Number(e.duration.startTime??0)+e.duration.seconds<=game.time.worldTime)return true;
   if(m.replyTo===actor?.uuid)return true;
   if(!m.expires||m.combatId!==combat.id)return false;
   if(m.expires==='endNextTurn'){const p=combat.previous??{},previousActor=combat.combatants?.get(p.combatantId)?.actor;return previousActor?.uuid===a.uuid&&p.round>=Number(m.endTurnRound??Number(m.createdRound)+1);}
   if(m.expires==='endCurrentTurn')return a.uuid!==actor?.uuid;
   return false;
  });await removeEffects(a,expired.map(e=>e.id));
 }
 if(actor){
  const docent=values(actor.items).find(i=>meta(i).docentTraits?.includes('med')&&isEquipped(i));
  if(docent&&actor.system.attributes.hp.value===0&&!actor.statuses.has('dead')&&(actor.system.attributes.death.success??0)<3){const result=await roll('1d20+7',actor,'Docent Life Support');if(result.total>=10)await actor.update({'system.attributes.death.success':3});}
 }
}
export async function worldTimeCleanup(){
 if(!activeGM())return;
 for(const actor of sceneActors()){
  await removeEffects(actor,actorEffects(actor,(m,e)=>e.duration?.seconds&&e.duration.startTime+e.duration.seconds<=game.time.worldTime).map(e=>e.id));
  for(const item of actor.items){const ids=values(item.effects).filter(e=>meta(e).expiresAt&&meta(e).expiresAt<=game.time.worldTime).map(e=>e.id);if(ids.length)await item.deleteEmbeddedDocuments('ActiveEffect',ids);}
 }
}
export const waitForDamage=actorUuid=>pendingDamage.get(actorUuid)??Promise.resolve();

/** Apply only the half-cover exception; never grant the stronger Sharpshooter rule. */
export function quarryCover(workflow){
 const imprint=values(workflow.actor?.items).find(i=>meta(i).quarry);if(!imprint||!workflow.token)return;
 const descriptors=foundry.utils.deepClone(workflow.targetDescriptors??[]);let changed=false;
 for(const t of workflow.targets??[]){
  if(t.actor?.uuid!==meta(imprint).quarry||distance(workflow.token,t)>60)continue;
  const cover=Math.max(Number(t.actor.system.attributes.ac.cover??0),Number(globalThis.MidiQOL?.computeCoverBonus?.(workflow.token,t,workflow.activity)??0));
  if(cover!==2)continue;
  const d=descriptors.find(d=>d.uuid===t.actor.uuid);if(d&&d.ac!=null&&!d[ID]){d.ac-=2;d[ID]=true;changed=true;}
 }
 if(changed)workflow.targetDescriptors=descriptors;
}
export function quarryVisibility(workflow){
 if(workflow.targets?.size!==1||!workflow.token)return;
 const target=[...workflow.targets][0],imprint=values(workflow.actor?.items).find(i=>meta(i).quarry===target.actor?.uuid);
 if(!imprint||distance(workflow.token,target)>60)return;
 const tracker=workflow.attackRollModifierTracker;if(!tracker?.toJSON||!tracker.restore)return;
 const data=foundry.utils.deepClone(tracker.toJSON()),keys=['invisible foe','Defender not detected','Hidden foe','Target hidden'];
 if(!keys.some(k=>data.attribution?.DIS?.[k]))return;
 for(const k of keys)delete data.attribution.DIS[k];
 data.disadvantage.active=Object.keys(data.attribution.DIS).length>0;
 for(const k of ['legacyAttribution','advReminderAttribution'])data[k]=(data[k]??[]).filter(v=>!keys.some(key=>v==='DIS:'+key));
 tracker.restore(data);
}

export function afterAttackConfiguration(workflow){
 quarryVisibility(workflow);
 if(workflow[ID]?.disadvantage){const t=workflow.attackRollModifierTracker;if(t?.disadvantage?.add)t.disadvantage.add('Wayfinder reaction','Unsettling Visage / Compelled Duel');else workflow.disadvantage=true;}
}
