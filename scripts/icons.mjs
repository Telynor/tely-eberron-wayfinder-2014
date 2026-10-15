/** v14 JournalEntry thumbnails are stored in a flag, not an img schema field. */
import {ID} from './mechanics.mjs';
export async function renderJournalIcons(app,html){
 const pack=app.collection;if(pack?.metadata?.packageName!==ID||pack.documentName!=='JournalEntry')return;
 const root=html?.querySelectorAll?html:html?.[0]??app.element;if(!root?.querySelectorAll)return;
 await pack.getIndex({fields:[`flags.${ID}.icon`]});
 for(const row of root.querySelectorAll('[data-entry-id], [data-document-id]')){
  const entry=pack.index.get(row.dataset.entryId??row.dataset.documentId),src=entry?.flags?.[ID]?.icon;if(!src)continue;
  let img=row.querySelector('img.thumbnail, img');if(!img){img=document.createElement('img');img.className='thumbnail';row.prepend(img);}
  img.src=src;if(img.dataset.src!==undefined)img.dataset.src=src;img.alt=entry.name;img.loading='lazy';img.decoding='async';img.width=48;img.height=48;Object.assign(img.style,{objectFit:'cover',objectPosition:'top',flex:'0 0 48px'});
 }
}
Hooks.once('init',()=>{const key=`flags.${ID}.icon`,fields=CONFIG.JournalEntry.compendiumIndexFields??=[];if(fields instanceof Set)fields.add(key);else if(!fields.includes(key))fields.push(key);});
Hooks.on('renderCompendium',(app,html)=>renderJournalIcons(app,html).catch(console.error));
