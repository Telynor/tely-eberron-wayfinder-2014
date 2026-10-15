/** Scene-aware services for the sourcebook's wind spells and eldritch machines. */
import {ID,meta,values,normalize,isWarforged,isEquipped} from './mechanics.mjs';
import {activeGM,actorEffects,makeEffect,removeEffects,tokenFor,distance,choose,form,say,escape,roll,safeRun} from './ui.mjs';
import {machineList,machinesAt} from './item-actions.mjs';
const checkedWind=new Set(),duelMoves=new Set();
export const sceneActors=()=>[...new Map([...(game.actors??[]),...(canvas.tokens?.placeables??[]).map(t=>t.actor).filter(Boolean)].map(a=>[a.uuid,a])).values()];
export function windTemplates(){return values(canvas.scene?.templates).filter(t=>meta(t).controlWinds&&!meta(t).paused&&(!meta(t).expiresAt||meta(t).expiresAt>game.time.worldTime));}
export function inWind(t,point,elevation=0){
 const m=meta(t);if(elevation<m.elevation||elevation>m.elevation+100)return false;
 const shape=t.object?.shape;if(shape?.contains)return shape.contains(point.x-t.x,point.y-t.y);
 const side=100/canvas.scene.grid.distance*canvas.scene.grid.size;return point.x>=t.x&&point.x<=t.x+side&&point.y>=t.y&&point.y<=t.y+side;
}
export function windsAt(token){return token?windTemplates().filter(t=>inWind(t,token.center,token.document.elevation??0)):[];}
export function windAttackRules(workflow){
 const activity=workflow.activity,weapon=workflow.item?.type==='weapon',ranged=activity?.attack?.type?.value==='ranged'||activity?.actionType==='rwak';
 if(!weapon||!ranged||!workflow.token)return;
 for(const t of windTemplates()){
  const m=meta(t);if(m.controlWinds==='Updraft'||m.controlWinds==='Gusts'&&m.intensity==='calm')continue;
  for(const target of workflow.targets??[]){
   const a=workflow.token.center,b=target.center,steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/10));
   for(let i=0;i<=steps;i++){const f=i/steps,p={x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f},z=(workflow.token.document.elevation??0)+((target.document.elevation??0)-(workflow.token.document.elevation??0))*f;if(inWind(t,p,z)){workflow.attackRollModifierTracker?.disadvantage?.add?workflow.attackRollModifierTracker.disadvantage.add('Wayfinder wind','Control Winds'):workflow.disadvantage=true;break;}}
  }
 }
}
async function downdraft(token,t){
 if(!(Number(token.document.elevation)>meta(t).elevation)||!token.actor?.system.attributes.movement.fly)return;
 const key=`${t.uuid}:${token.document.uuid}:${game.combat?.id??''}:${game.combat?.round??game.time.worldTime}:${game.combat?.turn??''}`;
 if(checkedWind.has(key))return;checkedWind.add(key);if(checkedWind.size>500)checkedWind.clear();
 const saves=await token.actor.rollSavingThrow({ability:'str',target:meta(t).saveDC,[ID]:{contextKnown:true,isMagic:true}});
 if(saves?.[0]?.total<meta(t).saveDC)await makeEffect(token.actor,'Downdraft: Prone',{statuses:['prone'],data:{windTemplate:t.uuid},origin:t.uuid});
}
export async function windTurn(combat){if(!activeGM())return;const token=combat.combatant?.token?.object;if(!token)return;for(const t of windsAt(token))if(meta(t).controlWinds==='Downdraft')await downdraft(token,t);}
export async function tokenMoved(doc,changes,options,user){
 if(!activeGM()||!(changes.x!=null||changes.y!=null||changes.elevation!=null))return;
 const token=doc.object;if(!token)return;for(const t of windsAt(token))if(meta(t).controlWinds==='Downdraft')await downdraft(token,t);
 await syncSuppression();
}
export async function manageWind(){
 const all=values(canvas.scene?.templates).filter(t=>meta(t).controlWinds&&(t.isOwner||game.user.isGM));
 const id=await choose('Manage Wind Cube',all.map(t=>({value:t.id,label:meta(t).controlWinds+' · '+(meta(t).paused?'paused':'active')})));if(!id)return;
 const t=canvas.scene.templates.get(id),action=await choose('Wind Action',['Change mode','Pause / resume','End spell']);if(!action)return;
 if(action==='End spell'){const e=await fromUuid(meta(t).concentrationUuid);if(e)await e.parent.endConcentration(e);else await t.delete();return;}
 if(action==='Pause / resume'){await t.setFlag(ID,'paused',!meta(t).paused);return;}
 const d=await form('Control Winds',[{name:'mode',label:'Mode',options:['Updraft','Downdraft','Gusts'],value:meta(t).controlWinds},{name:'intensity',label:'Gust intensity',options:['calm','moderate','strong'],value:meta(t).intensity},{name:'bearing',label:'Wind bearing',type:'number',value:meta(t).bearing}]);if(!d)return;
 await t.update({[`flags.${ID}.controlWinds`]:d.mode,[`flags.${ID}.intensity`]:d.intensity,[`flags.${ID}.bearing`]:d.bearing});
 await say(game.user.character,'Control Winds','<p>The wind changes as an action.</p>');
}
export async function resolveFall(actor){
 if(!actor?.isOwner&&!game.user.isGM)throw new Error('Select a creature you own.');
 const d=await form('Resolve Falling',[{name:'feet',label:'Distance fallen (feet)',type:'number',min:0,value:10},{name:'negated',label:'Feather Fall or another effect prevents falling damage',type:'checkbox'}]);if(!d)return;
 if(d.negated)return say(actor,'Falling','<p>Falling damage prevented by the selected effect.</p>');
 const dice=Math.min(20,Math.floor(Math.max(0,d.feet)/10));if(!dice)return;
 const r=await roll(`${dice}d6`,actor,'Falling');const half=windsAt(tokenFor(actor)).some(t=>meta(t).controlWinds==='Updraft');
 await actor.applyDamage([{type:'bludgeoning',value:half?Math.floor(r.total/2):r.total,properties:new Set()}],{[ID]:{falling:true}});
 await makeEffect(actor,'Fallen: Prone',{statuses:['prone'],data:{falling:true}});
}
export async function cleanupConcentration(actor,effect){
 if(!actor.isOwner&&!activeGM())return;
 const uuid=effect.uuid;
 for(const a of sceneActors())await removeEffects(a,actorEffects(a,m=>m.concentrationUuid===uuid,{inactive:true}).map(e=>e.id));
 for(const scene of game.scenes){const ids=values(scene.templates).filter(t=>meta(t).concentrationUuid===uuid&&(t.isOwner||game.user.isGM)).map(t=>t.id);if(ids.length)await scene.deleteEmbeddedDocuments('MeasuredTemplate',ids);}
}
export async function notifyFriendsEnded(effect){if(meta(effect).friendsTarget&&effect.parent?.isOwner)await say(effect.parent,'Friends Ends','<p>The affected creature realizes magic influenced it and becomes hostile. The GM chooses its response.</p>');}
export function preDuelMovement(doc,changes,options={}){
 if(!(changes.x!=null||changes.y!=null)||options[ID]?.duelApproved||!doc.isOwner)return;
 const duel=actorEffects(doc.actor,m=>m.duelSource)[0];if(!duel||duelMoves.has(doc.uuid))return;
 const source=tokenFor(fromUuidSync(meta(duel).duelSource)),token=doc.object;if(!source||!token)return;
 const end={x:(changes.x??doc.x)+token.w/2,y:(changes.y??doc.y)+token.h/2};
 if(canvas.grid.measurePath([source.center,end]).distance<=30)return;
 const allowed=meta(duel).allowedTurn,turn=`${game.combat?.id}:${game.combat?.round}:${game.combat?.turn}`;if(allowed===turn)return;
 duelMoves.add(doc.uuid);safeRun(async()=>{try{const dc=meta(duel).saveDC??13;const saves=await doc.actor.rollSavingThrow({ability:'wis',target:dc,[ID]:{contextKnown:true,isMagic:true}});if(saves?.[0]?.total>=dc){await duel.setFlag(ID,'allowedTurn',turn);await doc.update(changes,{...options,[ID]:{...options[ID],duelApproved:true}});}else await say(doc.actor,'Compelled Duel','<p>The saving throw failed. Choose a destination within 30 feet of the caster.</p>');}finally{duelMoves.delete(doc.uuid);}})();return false;
}
export async function endDuelOnAction(workflow){
 for(const a of sceneActors())for(const e of actorEffects(a,m=>m.duelSource)){
  const source=meta(e).duelSource;
  if(workflow.actor?.uuid===source&&[...(workflow.targets??[])].some(t=>t.actor?.uuid!==a.uuid)&&(workflow.activity?.type==='attack'||workflow.item?.type==='spell'))await removeEffects(a,[e.id]);
  else if(workflow.actor?.uuid!==source&&[...(workflow.hitTargets??[]),...(workflow.failedSaves??[])].some(t=>t.actor?.uuid===a.uuid)){
   const s=tokenFor(fromUuidSync(source)),w=workflow.token;if(s&&w&&s.document.disposition===w.document.disposition)await removeEffects(a,[e.id]);
  }
 }
}
export async function endDuelOnTurn(combat,changes,options){
 if(!activeGM()||!('turn'in changes||'round'in changes))return;
 const previous=combat.previous?.combatantId??options?.previous?.combatantId;
 for(const a of sceneActors())for(const e of actorEffects(a,m=>m.duelSource)){
  const caster=tokenFor(fromUuidSync(meta(e).duelSource)),target=tokenFor(a);
  if(caster&&target&&previous&&combat.combatants.get(previous)?.actor?.uuid===caster.actor.uuid&&distance(caster,target)>30)await removeEffects(a,[e.id]);
 }
}
export function machineDistance(token,m){return Math.hypot(token.center.x-m.x,token.center.y-m.y)/canvas.scene.grid.size*canvas.scene.grid.distance;}
export async function syncSuppression(){
 if(!activeGM()||!canvas.scene)return;
 for(const token of canvas.tokens.placeables){const actor=token.actor;if(!actor)continue;const sink=machinesAt(token).some(m=>m.kind==='spell-sink');
  for(const item of actor.items){const own=meta(item).itemKind&&meta(item).itemKind!=='armblade';if(own&&!!meta(item).machineSuppressed!==sink)await item.setFlag(ID,'machineSuppressed',sink);}
  const all=[...values(actor.effects),...values(actor.items).flatMap(i=>values(i.effects).filter(e=>e.transfer))];
  for(const effect of all){
   const stored=meta(effect).machineSuppressed;
   const origin=effect.origin?await fromUuid(effect.origin):effect.parent?.documentName==='Item'?effect.parent:null;
   const magical=origin?.type==='spell'||origin?.system?.properties?.has?.('mgc');
   if(sink&&magical&&!effect.disabled&&!stored)await effect.update({disabled:true,[`flags.${ID}.machineSuppressed`]:true});
   else if(!sink&&stored)await effect.update({disabled:false,[`flags.${ID}.-=machineSuppressed`]:null});
  }
 }
}
export async function queueReanimation(actor,changes,options,user){
 if(!activeGM()||meta(actor).reanimated||meta(actor).reanimation)return;
 const dead=actor.statuses.has('dead')||actor.type==='npc'&&actor.system.attributes.hp.value===0;
 if(!dead||!('system.attributes.hp.value'in changes||foundry.utils.getProperty(changes,'system.attributes.hp.value')===0||changes.statuses))return;
 const token=tokenFor(actor),machine=machinesAt(token).find(m=>m.kind==='mabaran-resonator');if(!machine)return;
 await actor.setFlag(ID,'reanimation',{machine:machine.id,scene:canvas.scene.id,at:game.time.worldTime+6,round:game.combat?.round,turn:game.combat?.turn,combat:game.combat?.id,controller:machine.controller});
}
export async function processReanimations(){
 if(!activeGM())return;
 for(const actor of sceneActors()){
  const pending=meta(actor).reanimation;if(!pending||pending.done||pending.scene!==canvas.scene?.id)continue;
  const roundReady=game.combat?.id===pending.combat&&(game.combat.round>pending.round&&(game.combat.turn>=pending.turn||game.combat.round>pending.round+1));if(game.time.worldTime<pending.at&&!roundReady)continue;
  const machine=machineList().find(m=>m.id===pending.machine&&m.active);if(!machine){await actor.setFlag(ID,'reanimation',null);continue;}
  const token=tokenFor(actor);if(!token)continue;
  let zombie=game.actors.find(a=>normalize(a.name)==='zombie'&&!meta(a).reanimated);
  if(!zombie){for(const p of game.packs.filter(p=>p.documentName==='Actor'&&p.visible)){const i=(await p.getIndex()).find(e=>normalize(e.name)==='zombie');if(i){const source=await p.getDocument(i._id),data=source.toObject();delete data._id;delete data.folder;zombie=await Actor.create(data);break;}}}
  if(!zombie){await actor.setFlag(ID,'reanimation',{...pending,done:true,needsZombie:true});ui.notifications.warn('Mabaran Resonator: install a canonical Zombie stat block to resolve this reanimation.');continue;}
  const controller=await fromUuid(pending.controller),data=zombie.prototypeToken.toObject();delete data._id;data.actorId=zombie.id;data.actorLink=false;data.name=actor.name+' (Zombie)';data.x=token.x;data.y=token.y;data.elevation=token.document.elevation;data.disposition=token.document.disposition;
  data.delta={name:data.name,ownership:controller?.ownership??{},flags:{[ID]:{reanimated:true,originalActor:actor.uuid,controller:pending.controller}}};
  await canvas.scene.createEmbeddedDocuments('Token',[data]);await actor.setFlag(ID,'reanimation',{...pending,done:true});await token.document.update({hidden:true});
  await say(actor,'Mabaran Resonator',`<p>${escape(actor.name)} rises as a zombie under its controller after one round. The original token is hidden for the GM to retain.</p>`);
 }
}
