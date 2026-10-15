import {ID,meta,values,actorHas,actorMark,isWarforged,shiftingStats,intuitionFor,integratedArmor,sizeAtMost,ARTISAN,MUSIC} from './mechanics.mjs';
import {choose,form,confirm,say,escape,roll,makeEffect,removeEffects,actorEffects,tokenFor,targetActor,distance,requireOwner,consume,relocate} from './ui.mjs';
import {castSpell,chooseSpell,grantSpell,WIZARD_CANTRIPS,SORCERER_FIRST} from './spells.mjs';
export const handlers={};
const fmeta=(item,updates)=>item.update(Object.fromEntries(Object.entries(updates).map(([k,v])=>[`flags.${ID}.${k}`,v])));
export async function spendHitDie(actor){
 const choices=values(actor.items).filter(i=>i.type==='class'&&Number(i.system.hd.spent??0)<Number(i.system.levels??0));
 if(actor.type==='npc'){
  const hd=actor.system.attributes.hd;if(Number(hd.value??0)<=0)throw new Error('No unspent Hit Dice.');
  await actor.update({'system.attributes.hd.spent':Number(hd.spent??0)+1});return `d${hd.denomination}`;
 }
 const id=await choose('Spend a Hit Die',choices.map(i=>({value:i.id,label:`${i.name}: ${i.system.hd.denomination}`})));if(!id)return null;
 const cls=actor.items.get(id);await cls.update({'system.hd.spent':Number(cls.system.hd.spent??0)+1});return cls.system.hd.denomination;
}
handlers['appearance']=async({actor,item})=>{
 const saved=meta(item).naturalAppearance??{name:actor.name,img:actor.img,tokenImg:tokenFor(actor)?.document.texture.src};
 const d=await form('Change Appearance',[{name:'name',label:'Appearance / identity name',value:actor.name},{name:'img',label:'Portrait image path (optional)',value:actor.img},{name:'token',label:'Token image path (optional)',value:tokenFor(actor)?.document.texture.src??''},{name:'revert',label:'Return to natural form',type:'checkbox'}],{intro:'Same size and basic body shape. Equipment and game statistics do not change.'});if(!d)return false;
 await fmeta(item,{naturalAppearance:saved,changedAppearance:!d.revert});await actor.update({name:d.revert?saved.name:d.name,img:d.revert?saved.img:d.img});
 const token=tokenFor(actor);if(token)await token.document.update({name:d.revert?saved.name:d.name,'texture.src':d.revert?saved.tokenImg:d.token});
 await say(actor,'Change Appearance',`<p>${d.revert?'Natural form restored.':escape(d.name)+' adopted. Suspicion-related Deception advantage is available in the trait check controls.'}</p>`);return true;
};
handlers['persona']=async({actor,item})=>{
 const d=await form('Divergent Persona',[{name:'name',label:'Persona name',value:meta(item).personaName??''},{name:'tool',label:'Persona tool proficiency',options:Object.keys(actor.system.tools??{}).map(k=>({value:k,label:CONFIG.DND5E.tools[k]?.label??k}))},{name:'active',label:'Currently in this persona',type:'checkbox',value:meta(item).personaActive}],{intro:'Your selected tool proficiency is doubled only while in this identity.'});if(!d)return false;await fmeta(item,{personaName:d.name,personaTool:d.tool,personaActive:d.active});return true;
};
handlers['psychic-glamour']=async({item})=>{const skill=await choose('Psychic Glamour',[{value:'ins',label:'Insight'},{value:'itm',label:'Intimidation'},{value:'prf',label:'Performance'},{value:'per',label:'Persuasion'}]);if(!skill)return false;await fmeta(item,{glamourSkill:skill,configured:true});return true;};
handlers['dual-mind']=async({actor,item})=>{await makeEffect(actor,'Dual Mind',{seconds:60,data:{dualMind:true,consumeAfterWisSave:true},origin:item.uuid});return say(actor,'Dual Mind','<p>Your next Wisdom saving throw has advantage. This uses your reaction.</p>');};
handlers['unsettling-visage']=async({actor,item})=>{await makeEffect(actor,'Unsettling Visage',{seconds:6,data:{unsettlingVisage:true,consumeAfterAttack:true},origin:item.uuid});return true;};
handlers['mind-link']=async({actor,item})=>{
 const target=targetActor(actor,{range:60});
 const input=await form('Telepathic Message',[{name:'message',label:'Message',type:'textarea'}]);if(!input)return false;
 await makeEffect(target,'Mind Link',{seconds:6,data:{replyTo:actor.uuid,expires:'startSourceTurn'},origin:item.uuid});
 const recipients=game.users.filter(u=>u.isGM||actor.testUserPermission(u,'OWNER')||target.testUserPermission(u,'OWNER')).map(u=>u.id);
 await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),whisper:recipients,content:`<h3>Mind Link → ${escape(target.name)}</h3><p>${escape(input.message)}</p>`});return true;
};
handlers['shifting']=async({actor,item})=>{
 const current=actorEffects(actor,m=>m.shifting);if(current.length){await removeEffects(actor,current.map(e=>e.id));return {refund:true};}
 const race=values(actor.items).map(meta).find(m=>m.key?.startsWith('race:shifter:'));if(!race)throw new Error('A shifter ancestry is required.');
 const sub=race.subrace;const extra=sub==='beasthide'?(await roll('1d6',actor,'Beasthide: Additional Temporary HP')).total:0;
 const s=shiftingStats(actor.system.details.level,actor.system.abilities.con.mod,sub,extra);
 await actor.applyDamage([{value:s.tempHP,type:'temphp',properties:new Set()}]);
 await makeEffect(actor,'Shifting',{seconds:60,changes:[...(s.ac?[['system.attributes.ac.bonus',s.ac]]:[]),...(s.speed?[['system.attributes.movement.walk',s.speed]]:[])],data:{shifting:true,shifterSubrace:sub},origin:item.uuid});
 await say(actor,'Shifting',`<p>${s.tempHP} temporary HP. ${sub==='beasthide'?'+1 AC.':sub==='swiftstride'?'+5 feet walking speed and reaction movement.':sub==='wildhunt'?'Advantage on Wisdom checks.':'Bonus action fangs attack available.'} Ends after one minute.</p>`);return true;
};
handlers['swiftstride-reaction']=async({actor})=>{
 const enemy=game.combat?.combatant?.token?.object;
 if(game.combat&&(!enemy||enemy.actor?.uuid===actor.uuid||distance(tokenFor(actor),enemy)>5))throw new Error('Use this when an enemy ends its turn within 5 feet.');
 return moveToken(actor,10,{intro:'Confirm an enemy has just ended its turn within 5 feet. This movement does not provoke opportunity attacks.'});
};
handlers['mark-scent']=async({actor,item})=>{const target=targetActor(actor,{range:10});await fmeta(item,{scentTarget:target.uuid,scentExpiresOnLongRest:true});return say(actor,'Mark the Scent',`<p>${escape(target.name)} marked. Location is known within 60 feet; checks to find this creature use doubled proficiency.</p>`);};
handlers['integrated-protection']=async({actor,item})=>{
 const armor=Array.from(actor.system.traits.armorProf.value);const options=[{value:'darkwood',label:'Darkwood Core'}];if(armor.includes('med'))options.push({value:'composite',label:'Composite Plating'});if(armor.includes('hvy'))options.push({value:'heavy',label:'Heavy Plating'});
 const mode=await choose('Integrated Protection',options,'Choose after a long rest. Worn armor provides no additional benefit; shields still apply.');if(!mode)return false;
 integratedArmor(mode,{dex:actor.system.abilities.dex.mod,proficiency:actor.system.attributes.prof,armor});
 const formula=mode==='heavy'?'16 + @prof':mode==='composite'?'13 + min(2, @abilities.dex.mod) + @prof':`11 + @abilities.dex.mod${armor.includes('lgt')?' + @prof':''}`;
 if(!meta(item).previousAC)await fmeta(item,{previousAC:foundry.utils.deepClone(actor._source.system.attributes.ac)});
 await fmeta(item,{protectionMode:mode,managedAC:formula,configured:true});await actor.update({'system.attributes.ac.calc':'custom','system.attributes.ac.formula':formula});
 await say(actor,'Integrated Protection',`<p>${escape(options.find(o=>o.value===mode).label)} selected. Armor class scales with proficiency.</p>`);return true;
};
handlers['integrated-tool']=async({actor,item})=>{const t=await choose('Integrated Tool',Object.keys(actor.system.tools??{}).filter(k=>actor.system.tools[k].value>=1).map(k=>({value:k,label:CONFIG.DND5E.tools[k]?.label??k})));if(!t)return false;await fmeta(item,{integratedTool:t,configured:true});return true;};
handlers['imprint-prey']=async({actor,item})=>{
 const target=targetActor(actor,{range:30});await fmeta(item,{quarry:target.uuid});return say(actor,'Imprint Prey',`<p>${escape(target.name)} is your quarry. Tracking doubles your Intuition die. Within 60 feet: known location, no hidden or invisibility benefit against you, and half cover ignored.</p>`);
};
handlers['healing-touch']=async({actor,item})=>{
 const target=targetActor(actor,{range:5,self:true}),die=await spendHitDie(actor);if(!die)return false;
 const r=await roll(`max(0, 1${die} + @abilities.wis.mod)`,actor,'Healing Touch');
 if(target.isOwner||game.user.isGM)await target.applyDamage([{type:'healing',value:r.total,properties:new Set()}]);
 else await MidiQOL.socket().executeAsGM('updateActor',{actorUuid:target.uuid,updates:{'system.attributes.hp.value':Math.min(target.system.attributes.hp.max,target.system.attributes.hp.value+r.total)}});
 return true;
};
handlers['magecraft']=async({actor,item})=>{
 const spell=await chooseSpell('Magecraft: Wizard Cantrip',s=>s.level===0&&WIZARD_CANTRIPS.has(s.name.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()));if(!spell)return false;
 const old=values(actor.items).filter(i=>meta(i).key==='magecraft:cantrip'&&meta(i).sourceItemUuid===item.uuid);if(old.length)await actor.deleteEmbeddedDocuments('Item',old.map(i=>i.id));
 const granted=await grantSpell(actor,spell,{ability:'int',source:item,key:'magecraft:cantrip'});await fmeta(item,{magecraftSpell:granted.uuid,configured:true});return true;
};
handlers['spellsmith']=async({actor,item})=>{
 const candidates=values(actor.items).filter(i=>['weapon','equipment'].includes(i.type)&&!i.system.properties?.has?.('mgc')&&!i.system.magicalBonus&&(i.type==='weapon'||['light','medium','heavy'].includes(i.system.type?.value)));
 const id=await choose('Spellsmith',candidates.map(i=>({value:i.id,label:i.name})),'Spend one minute enchanting a nonmagical weapon or suit of armor for one hour.');if(!id)return false;
 const target=actor.items.get(id);const changes=target.type==='weapon'?[['system.magicalBonus',1]]:[['system.armor.magicalBonus',1]];
 await target.createEmbeddedDocuments('ActiveEffect',[{name:'Spellsmith +1',type:'enchantment',img:item.img,transfer:false,disabled:false,origin:item.uuid,changes:[...changes.map(([key,v])=>({key,value:String(v),mode:2,priority:20})),{key:'system.properties',value:'mgc',mode:2,priority:20}],duration:{seconds:3600,startTime:game.time.worldTime},flags:{[ID]:{spellsmith:true,expiresAt:game.time.worldTime+3600}}}]);return true;
};
export async function moveToken(actor,maxDistance,{intro='',companion=null,teleport=false}={}){
 const token=tokenFor(actor);if(!token)throw new Error('Select a token on the current scene.');
 ui.notifications.info('Click a destination on the scene. Press Escape to cancel.');
 const point=await new Promise(resolve=>{
  const click=event=>{canvas.stage.off('pointerdown',click);window.removeEventListener('keydown',key);resolve(event.getLocalPosition(canvas.stage));};
  const key=e=>{if(e.key==='Escape'){canvas.stage.off('pointerdown',click);window.removeEventListener('keydown',key);resolve(null);}};
  canvas.stage.once('pointerdown',click);window.addEventListener('keydown',key);
 });if(!point)return false;
 const grid=canvas.scene.grid;const snapped=canvas.grid.getSnappedPoint({x:point.x-token.w/2,y:point.y-token.h/2},{mode:CONST.GRID_SNAPPING_MODES.TOP_LEFT_CORNER});
 const destination={x:snapped.x+token.w/2,y:snapped.y+token.h/2};
 if(canvas.grid.measurePath([token.center,destination]).distance>maxDistance)throw new Error(`Destination exceeds ${maxDistance} feet.`);
 if(!canvas.dimensions.sceneRect.contains(destination.x,destination.y))throw new Error('The destination is outside this scene.');
 const placements=[{token,x:snapped.x,y:snapped.y}];if(companion)placements.push({token:companion,x:snapped.x+token.w,y:snapped.y});
 for(const p of placements){
  const rect={x:p.x,y:p.y,w:p.token.w,h:p.token.h};
  if(!canvas.dimensions.sceneRect.contains(rect.x,rect.y)||!canvas.dimensions.sceneRect.contains(rect.x+rect.w-1,rect.y+rect.h-1))throw new Error('The destination is outside this scene.');
  if(canvas.tokens.placeables.some(t=>!placements.some(p=>p.token.id===t.id)&&rect.x<t.x+t.w&&rect.x+rect.w>t.x&&rect.y<t.y+t.h&&rect.y+rect.h>t.y))throw new Error('The destination is occupied.');
  if(!teleport&&p.token.checkCollision?.({x:p.x+p.token.w/2,y:p.y+p.token.h/2},{origin:p.token.center,type:'move',mode:'any'}))throw new Error('A wall blocks that movement.');
 }
 if(!await confirm('Confirm Destination',intro||'Confirm that you can see this unoccupied destination.'))return false;
 for(const p of placements)await relocate(p.token,{x:p.x,y:p.y},{teleport});return true;
}
handlers['shared-passage']=async({actor})=>{
 const companion=[...game.user.targets][0];if(companion&&(distance(tokenFor(actor),companion)>5||!sizeAtMost(companion.actor.system.traits.size,actor.system.traits.size)))throw new Error('Your willing companion must be within 5 feet and no larger than you.');
 return moveToken(actor,actor.system.attributes.movement.walk,{companion,teleport:true,intro:'Confirm both destinations are visible, and the companion is willing and within carrying capacity.'});
};
handlers['vigilant-guardian']=async({actor,item})=>{const target=targetActor(actor);await fmeta(item,{ward:target.uuid});return say(actor,'Vigilant Guardian',`<p>${escape(target.name)} is your ward.</p>`);};
handlers['guardian-swap']=async({actor,item})=>{
 const ward=await fromUuid(meta(item).ward??'');const a=tokenFor(actor),b=tokenFor(ward);if(!a||!b||distance(a,b)>5)throw new Error('Your ward must be within 5 feet.');
 if(!await confirm('Vigilant Guardian','Use your reaction before the attack resolves, swap places, and become its target?'))return false;
 const start={x:a.x,y:a.y};await relocate(a,{x:b.x,y:b.y},{teleport:true});await relocate(b,start,{teleport:true});return true;
};
handlers['hide']=async({actor})=>actor.rollSkill({skill:'ste'},{configure:true});
handlers['help']=async({actor,item})=>{const target=targetActor(actor,{range:30});await makeEffect(target,'Expert Handling Help',{seconds:60,data:{helpFrom:actor.uuid,oneCheck:true},origin:item.uuid});return true;};
handlers['determined-stride']=async({actor,item})=>{await makeEffect(actor,'Determined Stride',{seconds:6,data:{ignoreDifficultTerrain:true,expires:'endCurrentTurn'},origin:item.uuid});return say(actor,'Determined Stride','<p>Dash: difficult terrain adds no movement cost this turn.</p>');};
handlers['natural-talent']=async({actor,item})=>{
 if(meta(item).configured)return say(actor,'Natural Talent','<p>Your proficiency choice is already configured.</p>');
 const choice=await choose('Natural Talent',[{value:'performance',label:'Performance proficiency'},{value:'instrument',label:'One musical instrument'}]);if(!choice)return false;
 if(choice==='performance')await actor.update({'system.skills.prf.value':Math.max(1,actor._source.system.skills?.prf?.value??0)});
 else{const tool=await choose('Musical Instrument',MUSIC.map(k=>({value:k,label:CONFIG.DND5E.tools[k]?.label??k})));if(!tool)return false;await actor.update({[`system.tools.${tool}.value`]:Math.max(1,actor.system.tools?.[tool]?.value??0)});}
 await fmeta(item,{configured:true});return true;
};
handlers['greater-dragonmark']=async({actor,item,config})=>{
 const mark=actorMark(actor);if(!mark)throw new Error('A true dragonmark is required.');if(actor.system.details.level<8)throw new Error('Greater Dragonmark requires level 8.');
 const [abilities,ability,rest,spells]=config.greater[mark];
 if(meta(item).configured&&values(item.system.activities).some(a=>meta(a).handler==='greater-cast'))return say(actor,'Greater Dragonmark','<p>This feat is already configured. Its remaining spell uses have been preserved.</p>');
 if(!meta(item).configured){
  const ab=await choose('Greater Dragonmark: Ability',abilities.map(a=>({value:a,label:CONFIG.DND5E.abilities[a].label})));if(!ab)return false;
  const value=actor._source.system.abilities[ab].value;if(value>=20)throw new Error('Choose an eligible ability below 20.');
  await actor.update({[`system.abilities.${ab}.value`]:value+1});await fmeta(item,{configured:true,mark,abilityIncrease:ab});
 }
 const activities={};
 for(const name of spells){const id=foundry.utils.randomID();activities[id]={_id:id,type:'utility',name:'Cast '+name,activation:{type:'action',value:1,override:true},roll:{formula:'',prompt:false},uses:{spent:0,max:'1',recovery:[{period:rest,type:'recoverAll'}]},consumption:{spellSlot:false,targets:[{type:'activityUses',target:'',value:'1'}]},flags:{[ID]:{handler:'greater-cast',spell:name,ability,requiresSiberys:mark==='warding'&&name.includes('Chest')}}};}
 if(mark==='handling'){const id=foundry.utils.randomID();activities[id]={_id:id,type:'utility',name:'Switch Beast Sense Perception',activation:{type:'action',value:1,override:true},roll:{formula:'',prompt:false},consumption:{spellSlot:false,targets:[]},flags:{[ID]:{handler:'beast-sense-toggle'}}};}
 const prior=Object.values(item._source.system.activities??{}).filter(a=>meta(a).handler!=='greater-cast');for(const a of prior)activities[a._id]=a;
 await item.update({'system.activities':activities});return say(actor,'Greater Dragonmark','<p>Intuition die increased one size. The granted spells are available on this feat, each with its own recovery.</p>');
};
handlers['greater-cast']=async({actor,item,activity})=>{
 const m=meta(activity);if(m.requiresSiberys&&!await confirm('Secret Chest Focus','Are you holding a Siberys dragonshard worth at least 100 gp?'))return false;
 return castSpell(actor,m.spell,{ability:m.ability,materialComponents:false,sourceItem:item});
};
handlers['aberrant-spells']=async({actor,item})=>{
 if(actorMark(actor))throw new Error('An existing true dragonmark prevents Aberrant Dragonmark.');
 if(meta(item).configured)return say(actor,'Aberrant Dragonmark','<p>Your spells are already chosen. Your remaining use has been preserved.</p>');
 const cantrip=await chooseSpell('Aberrant Cantrip',s=>s.level===0&&WIZARD_CANTRIPS.has(s.name.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim())&&!['toll the dead'].includes(s.name.toLowerCase()));if(!cantrip)return false;
 const spell=await chooseSpell('Aberrant 1st-Level Spell',s=>s.level===1&&SORCERER_FIRST.has(s.name.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()));if(!spell)return false;
 await fmeta(item,{aberrantCantrip:cantrip.name,aberrantSpell:spell.name,configured:true});await item.update({'system.uses':{spent:0,max:'1',recovery:[{period:'lr',type:'recoverAll'}]}});return true;
};
async function aberrantCast({actor,item},cantrip=false){
 const name=meta(item)[cantrip?'aberrantCantrip':'aberrantSpell'];if(!name)throw new Error('Choose your aberrant spells first.');
 if(!cantrip&&Number(item.system.uses.spent)>=1)throw new Error('Your aberrant spell is expended until your next long rest.');
 const boost=await confirm('Aberrant Mark: Risk Vitality','Spend a Hit Die to increase the spell’s level by one and take the die result as damage after casting? Cancel casts normally.');
 const previous=values(actor.items).filter(i=>i.type==='class').map(i=>({_id:i.id,'system.hd.spent':i.system.hd.spent??0})),npcSpent=actor.system.attributes.hd?.spent??0;
 const die=boost?await spendHitDie(actor):null;if(boost&&!die)return false;
 let result;
 try{result=await castSpell(actor,name,{ability:'con',level:cantrip?0:1,boost:die?1:0,sourceItem:item});}
 finally{if(die&&!result){if(actor.type==='npc')await actor.update({'system.attributes.hd.spent':npcSpent});else await actor.updateEmbeddedDocuments('Item',previous);}}
 if(result){if(!cantrip)await consume(item);if(die){const r=await roll('1'+die,actor,'Aberrant Mark: Vitality Cost');await actor.applyDamage([{type:'none',value:r.total,properties:new Set()}],{ignore:true});}}return !!result;
}
handlers['aberrant-cast']=ctx=>aberrantCast(ctx,false);handlers['aberrant-cantrip']=ctx=>aberrantCast(ctx,true);
handlers['revenant-blade']=async({actor,item})=>{await fmeta(item,{twoHanded:!meta(item).twoHanded});return true;};
handlers['elf-training']=async({actor,item})=>{
 if(meta(item).configured)return say(actor,'Elf Training','<p>This replacement is already configured.</p>');
 if(!await confirm('Replace Elf Weapon Training','Replace your Elf Weapon Training with this cultural trait?'))return false;
 const current=new Set(actor._source.system.traits.weaponProf.value??[]);for(const key of ['longsword','shortsword','shortbow','longbow'])current.delete(key);
 if(meta(item).culture==='valenar')for(const key of ['scimitar','double-bladed-scimitar','longbow','shortbow'])current.add(key);
 else{
  const kind=await choose('Aereni Expertise',['Skill','Tool']);if(!kind)return false;
  const opts=kind==='Skill'?Object.keys(actor.system.skills):Object.keys(CONFIG.DND5E.tools);const key=await choose('Expertise',opts.map(k=>({value:k,label:kind==='Skill'?CONFIG.DND5E.skills[k].label:CONFIG.DND5E.tools[k].label})));if(!key)return false;
  await actor.update({[`system.${kind==='Skill'?'skills':'tools'}.${key}.value`]:2});
 }
 await actor.update({'system.traits.weaponProf.value':[...current]});await fmeta(item,{configured:true});return true;
};
handlers['trait-check']=async({actor,item})=>{
 const m=meta(item).intuition;if(!m)return false;
 const choices=[...(m.skills??[]).map(s=>({value:'skill:'+s,label:CONFIG.DND5E.skills[s].label})),...(m.tools??[]).map(s=>({value:'tool:'+s,label:CONFIG.DND5E.tools[s]?.label??s}))];
 if(m.artisan)for(const k of ARTISAN)choices.push({value:'tool:'+k,label:CONFIG.DND5E.tools[k]?.label??k});
 const fields=[{name:'choice',label:'Qualifying check',options:choices}];if(meta(item).mark==='finding'&&values(actor.items).some(i=>meta(i).quarry))fields.push({name:'tracking',label:'This Survival check tracks your imprinted quarry',type:'checkbox'});
 const d=await form(item.name,fields);if(!d)return false;const [kind,key]=d.choice.split(':');const context={intuitionContext:true,trackingQuarry:key==='sur'&&!!d.tracking};
 return kind==='skill'?actor.rollSkill({skill:key,[ID]:context}):actor.rollToolCheck({tool:key,[ID]:context});
};
handlers['cast-spell']=async({actor,item,activity})=>{const m=meta(activity);if(m.minimumLevel&&actor.system.details.level<m.minimumLevel)throw new Error('This spell requires level '+m.minimumLevel);return castSpell(actor,m.spell,{ability:m.ability,ritual:m.ritualOnly,level:m.spellLevel,materialComponents:m.materialComponents,sourceItem:item});};

handlers['conditional-check']=async({actor,item})=>{
 const m=meta(item),skill=m.ward?await choose('Spot Threats to Ward',[{value:'ins',label:'Insight'},{value:'prc',label:'Perception'}]):m.stonecunning?'his':m.key==='changeling:appearance'?'dec':await choose('Find Marked Scent',Object.keys(CONFIG.DND5E.skills).map(k=>({value:k,label:CONFIG.DND5E.skills[k].label})));
 if(!skill)return false;
 if(m.scentTarget&&distance(tokenFor(actor),tokenFor(await fromUuid(m.scentTarget)))<=60)await say(actor,'Marked Scent','<p>The marked creature is within 60 feet. Its location is known even if hidden.</p>',{whisper:true});
 return actor.rollSkill({skill,advantage:m.key==='changeling:appearance',[ID]:{stonework:!!m.stonecunning,scentTracking:!!m.scentTarget,wardThreat:!!m.ward}});
};

handlers['beast-sense-toggle']=async({actor,item})=>{
 const link=actorEffects(actor,m=>m.beastSenseTarget)[0];if(!link)throw new Error('Cast Beast Sense first.');
 const active=actorEffects(actor,m=>m.beastSenseActive);if(active.length){await removeEffects(actor,active.map(e=>e.id));return true;}
 await makeEffect(actor,'Beast Sense: Perceiving',{statuses:['blinded','deafened'],data:{beastSenseActive:true,concentrationUuid:meta(link).concentrationUuid,beastSenseTarget:meta(link).beastSenseTarget},origin:item.uuid});
 return say(actor,'Beast Sense','<p>You perceive through the linked creature’s senses and cannot use your own sight or hearing until you use an action to return.</p>');
};
