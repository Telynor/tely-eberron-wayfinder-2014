/** Pure rules: no Foundry globals or document mutations. */
export const ID="tely-eberron-wayfinder-2014";
export const ARTISAN=['alchemist','brewer','calligrapher','carpenter','cartographer','cobbler','cook','glassblower','jeweler','leatherworker','mason','painter','potter','smith','tinker','weaver','woodcarver'];
export const MUSIC=['bagpipes','drum','dulcimer','flute','horn','lute','lyre','panflute','shawm','viol'];
export const currencyCopper=currency=>Object.entries(currency??{}).reduce((n,[k,v])=>n+Number(v)*({pp:1000,gp:100,ep:50,sp:10,cp:1}[k]??0),0);
export function payGold(currency,gold){const left=Math.round(currencyCopper(currency)-gold*100);if(left<0)throw new Error('Insufficient currency.');return {pp:Math.floor(left/1000),gp:Math.floor(left%1000/100),ep:0,sp:Math.floor(left%100/10),cp:left%10};}
export const meta=d=>d?.flags?.[ID]??{};
export const values=v=>v?.contents??(Array.isArray(v)?v:v instanceof Map?[...v.values()]:Object.values(v??{}));
export const normalize=s=>String(s??"").normalize("NFKD").replace(/[’‘]/g,"'").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
export function canonicalKey(d){
 const f=meta(d),foreign=Object.values(d.flags??{}).find(v=>v&&typeof v==='object'&&v.canonicalKey);if(f.canonicalKey||foreign?.canonicalKey)return f.canonicalKey??foreign.canonicalKey;const parent=d.flags?.['tely-tashas-2014']?.parent??f.parent;const type=['equipment','weapon','consumable','loot'].includes(d.type)?'item':d.type;return `${type}:${normalize(d.name)}${parent?':'+normalize(parent):''}`;
}
export function duplicateGroups(documents){
 const groups=new Map();for(const d of documents){if(!["class","subclass","race","feat","spell","equipment","weapon","consumable","loot","npc"].includes(d.type))continue;const key=canonicalKey(d);const g=groups.get(key)??[];g.push(d);groups.set(key,g);}
 return [...groups.entries()].filter(([,v])=>v.length>1).map(([key,entries])=>({key,entries}));
}
export const isEquipped=i=>!!i?.system?.equipped&&!meta(i).machineSuppressed&&(i.system.attunement!=="required"||!!i.system.attuned);
export function actorMark(actor){return values(actor?.items).map(meta).find(m=>m.ancestry&&m.mark)?.mark??null;}
export function actorHas(actor,key){return values(actor?.items).some(i=>meta(i).key===key);}
export function isWarforged(actor){return values(actor?.items).some(i=>meta(i).key?.startsWith("race:warforged:"))||normalize(actor?.system?.details?.race?.name??actor?.system?.details?.race).includes("warforged");}
export function intuitionDie({sources=1,greater=false,improvements=0}={}){return Math.min(10,4+2*(Math.max(1,sources)-1+Number(greater)+Math.max(0,improvements)));}
export function intuitionFor(actor,{skill,tool,initiative=false,context=false}={}){
 const eligible=values(actor?.items).filter(i=>{
  const m=meta(i).intuition;if(!m)return false;if(m.conditional&&!context&&!initiative)return false;
  return (skill&&m.skills?.includes(skill))||(tool&&(m.tools?.includes(tool)||m.artisan&&/^(art:)?(alchemist|brewer|calligrapher|carpenter|cartographer|cobbler|cook|glassblower|jeweler|leatherworker|mason|painter|potter|smith|tinker|weaver|woodcarver)$/.test(tool)))||(initiative&&m.initiative);
 });
 const g=values(actor?.items).some(i=>meta(i).greaterMark&&meta(i).configured);
 const sources=new Set(eligible.map(i=>meta(i).key));
 if(skill==="ins"&&values(actor?.items).some(i=>meta(i).goggles&&isEquipped(i))&&actorMark(actor)==="finding")sources.add("goggles:finding");
 return sources.size?{die:intuitionDie({sources:sources.size,greater:g}),sources:[...sources]}:null;
}
export function shiftingStats(level,con,subrace,extra=0){return {tempHP:Math.max(1,Number(level)+Number(con))+(subrace==="beasthide"?extra:0),ac:subrace==="beasthide"?1:0,speed:subrace==="swiftstride"?5:0,wisdomAdvantage:subrace==="wildhunt"};}
export function integratedArmor(mode,{dex=0,proficiency=2,armor=[]}={}){
 const prof=new Set(armor);if(mode==="heavy"&&!prof.has("hvy"))throw new Error("Heavy armor proficiency is required.");
 if(mode==="composite"&&!prof.has("med"))throw new Error("Medium armor proficiency is required.");
 return mode==="heavy"?{base:16+proficiency,stealthDisadvantage:true}:mode==="composite"?{base:13+Math.min(2,dex)+proficiency,stealthDisadvantage:false}:{base:11+dex+(prof.has("lgt")?proficiency:0),stealthDisadvantage:false};
}
export function splitSharedDamage(total){const protectedDamage=Math.floor(Math.max(0,total)/2);return {protectedDamage,transferredDamage:Math.max(0,total)-protectedDamage};}
export function reduceTypedDamage(damages,types,reduction){
 let remaining=Math.max(0,reduction);const result=damages.map(d=>({...d,properties:d.properties instanceof Set?new Set(d.properties):d.properties}));
 for(const d of result)if(types.includes(d.type)&&d.value>0&&remaining>0){const applied=Math.min(d.value,remaining);d.value-=applied;remaining-=applied;}
 return result;
}
export function resourceAvailable(item){const max=Number(item?.system?.uses?.max);return !Number.isFinite(max)||max<=0||Number(item.system.uses.spent??0)<max;}
export const CRAFTING={common:{schemaDays:3,minSkill:2,weeks:1,gold:50,cr:[1,3]},uncommon:{schemaDays:5,minSkill:4,weeks:2,gold:200,cr:[4,8]},rare:{schemaDays:15,minSkill:6,weeks:10,gold:2000,cr:[9,12]},veryRare:{schemaDays:40,minSkill:8,weeks:25,gold:20000,cr:[13,18]},legendary:{schemaDays:80,minSkill:10,weeks:20,gold:100000,cr:[19,null]}};
export function craftingCost(rarity,{consumable=false,focus=false}={}){const r=CRAFTING[rarity];if(!r)throw new Error("Unknown rarity");return {...r,weeks:r.weeks/(consumable?2:1),gold:r.gold/(consumable?2:1)/(focus?2:1)};}
export function deltaDistance(start,end,gridSize,gridDistance){return Math.hypot(end.x-start.x,end.y-start.y)/gridSize*gridDistance;}
export function pounceEligible(movement,target){return movement.distance>=30&&movement.straight!==false&&movement.targetUuid===target;}
export function expiresAtTurn(record,combat){if(!record)return false;if(record.worldTime!=null)return false;return combat?.id===record.combatId&&(combat.round>record.round||(combat.round===record.round&&combat.turn>=record.turn));}
export function sizeAtMost(a,b){const sizes=["tiny","sm","med","lg","huge","grg"];return sizes.includes(a)&&sizes.includes(b)&&sizes.indexOf(a)<=sizes.indexOf(b);}
export function docReferences(value,out=new Set()){
 if(typeof value==="string"){if(/^Compendium\.[\w.-]+$/.test(value))out.add(value);for(const m of value.matchAll(/@UUID\[(Compendium\.[^\]#]+)/g))out.add(m[1]);}
 else if(Array.isArray(value))for(const v of value)docReferences(v,out);else if(value&&typeof value==="object")for(const v of Object.values(value))docReferences(v,out);return out;
}
