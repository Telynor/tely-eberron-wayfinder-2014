import {ID,meta,values} from './mechanics.mjs';
export const escape=s=>String(s??"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const selectedActor=()=>canvas?.tokens?.controlled?.[0]?.actor??game.user.character;
export const activeGM=()=>game.user.id===game.users.activeGM?.id;
export function requireOwner(actor){if(!actor||!(actor.isOwner||game.user.isGM))throw new Error('Select a character you own.');return actor;}
export function requireGM(){if(!game.user.isGM)throw new Error('This action requires the GM.');}
export async function form(title,fields,{button='Apply',intro=''}={}){
 const content=`<form><p>${escape(intro)}</p>${fields.map(f=>`<div class="form-group"><label>${escape(f.label)}</label>${f.options?`<select name="${escape(f.name)}">${f.options.map(o=>`<option value="${escape(o.value??o)}" ${(o.value??o)===f.value?'selected':''}>${escape(o.label??o)}</option>`).join('')}</select>`:f.type==='checkbox'?`<input type="checkbox" name="${escape(f.name)}" ${f.value?'checked':''}>`:f.type==='textarea'?`<textarea name="${escape(f.name)}">${escape(f.value??'')}</textarea>`:`<input name="${escape(f.name)}" type="${escape(f.type??'text')}" value="${escape(f.value??'')}" ${f.min!=null?`min="${f.min}"`:''} ${f.max!=null?`max="${f.max}"`:''}>`}</div>`).join('')}</form>`;
 return foundry.applications.api.DialogV2.wait({window:{title},content,buttons:[{action:'apply',label:button,default:true,callback:(_e,_b,d)=>Object.fromEntries(fields.map(f=>{const el=d.element.querySelector(`[name="${f.name}"]`);return [f.name,f.type==='checkbox'?el.checked:f.type==='number'?Number(el.value):el.value];}))},{action:'cancel',label:'Cancel',callback:()=>null}],rejectClose:false});
}
export async function choose(title,options,intro=''){if(!options.length)throw new Error('No eligible choice is available.');return (await form(title,[{name:'choice',label:'Choose',options}],{intro}))?.choice??null;}
export const confirm=async(title,intro)=>!!(await form(title,[],{intro,button:'Continue'}));
export async function say(actor,title,body,{whisper=false}={}){return ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:`<section class="tely-wgte"><h3>${escape(title)}</h3>${body}</section>`,...(whisper?{whisper:ChatMessage.getWhisperRecipients('GM').map(u=>u.id)}:{})});}
export async function roll(formula,actor,label,options={}){const r=await new Roll(formula,actor?.getRollData?.()??{},options).evaluate();await r.toMessage({speaker:ChatMessage.getSpeaker({actor}),flavor:label});return r;}
export function tokenFor(actor){return actor?.token?.object??actor?.getActiveTokens?.(true,true)?.[0]?.object??actor?.getActiveTokens?.(true,true)?.[0]??canvas.tokens.placeables.find(t=>t.actor?.uuid===actor?.uuid);}
export function distance(a,b){if(!a||!b)return Infinity;if(globalThis.MidiQOL?.computeDistance)return MidiQOL.computeDistance(a,b,false);return canvas.grid.measurePath([a.center,b.center]).distance;}
export function targetActor(actor,{range=Infinity,self=false}={}){const t=[...game.user.targets][0];if(!t){if(self)return actor;throw new Error('Target a creature first.');}if(distance(tokenFor(actor),t)>range)throw new Error(`The target must be within ${range} feet.`);return t.actor;}
export async function effects(actor,documents){
 if(actor.isOwner||game.user.isGM)return actor.createEmbeddedDocuments('ActiveEffect',documents);
 if(globalThis.MidiQOL?.socket)return MidiQOL.socket().executeAsGM('createEffects',{actorUuid:actor.uuid,effects:documents});
 throw new Error('A connected GM with Midi-QOL is required to affect this target.');
}
export async function removeEffects(actor,ids){
 if(!ids.length)return;
 if(actor.isOwner||game.user.isGM)return actor.deleteEmbeddedDocuments('ActiveEffect',ids);
 if(globalThis.MidiQOL?.socket)return MidiQOL.socket().executeAsGM('removeEffects',{actorUuid:actor.uuid,effects:ids});
 throw new Error('A connected GM with Midi-QOL is required to remove this effect.');
}
export async function relocate(token,point,{teleport=false}={}){
 const doc=token.document??token;
 if(doc.isOwner||game.user.isGM){
  if(doc.move)return doc.move({x:point.x,y:point.y,action:teleport?'displace':CONFIG.Token.movement.defaultAction,forced:true,snapped:true},{animate:!teleport,constrainOptions:{ignoreWalls:teleport,ignoreCost:teleport,ignoreTokens:teleport},[ID]:{teleport}});
  return doc.update(point,{[ID]:{teleport}});
 }
 if(globalThis.MidiQOL?.socket){const obj=doc.object;return MidiQOL.socket().executeAsGM('moveToken',{tokenUuid:doc.uuid,newCenter:{x:point.x+obj.w/2,y:point.y+obj.h/2},options:{teleport,ignoreWalls:teleport,ignoreTokens:teleport,animate:!teleport}});}
 throw new Error('A connected GM is required to move this companion.');
}
export async function makeEffect(actor,name,{changes=[],seconds=null,statuses=[],data={},origin=null}={}){
 return effects(actor,[{name,img:data.img??'icons/magic/symbols/runes-carved-stone-green.webp',type:'base',origin,transfer:false,disabled:false,changes:changes.map(([key,value,mode=2])=>({key,value:String(value),mode,priority:20})),statuses,duration:seconds?{seconds,startTime:game.time.worldTime}:{},flags:{[ID]:{...data,ownedEffect:true}}}]);
}
export async function consume(item,n=1){requireOwner(item.actor);if(Number(item.system.uses.max)<=Number(item.system.uses.spent??0)+n-1)throw new Error('No uses remaining.');await item.update({'system.uses.spent':Number(item.system.uses.spent??0)+n});}
export async function refund(item,n=1){if(item?.system?.uses?.max)await item.update({'system.uses.spent':Math.max(0,Number(item.system.uses.spent??0)-n)});}
export function safeRun(fn){return (...args)=>Promise.resolve().then(()=>fn(...args)).catch(e=>{console.error(ID,e);ui.notifications.error(e.message);});}
export const actorEffects=(a,predicate,{inactive=false}={})=>values(a?.effects).filter(e=>(inactive||!e.disabled)&&meta(e).ownedEffect&&predicate(meta(e),e));

export async function concentrate(actor,item,seconds,data={}){
 const existing=values(actor.concentration?.effects);
 if(existing.length&&!await confirm('Concentration','End your existing concentration to maintain this effect?'))return null;
 if(existing.length)await actor.endConcentration();
 const activity=values(item?.system?.activities)[0];if(!activity)throw new Error('The source activity is missing.');
 return actor.beginConcentrating(activity,{duration:{seconds,startTime:game.time.worldTime},flags:{[ID]:{ownedEffect:true,serviceConcentration:true,...data}}});
}
