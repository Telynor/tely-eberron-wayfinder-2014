/** Reopen the actual packaged LevelDB, catching omitted/recovery files in the ZIP. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
const root=path.resolve(import.meta.dirname,'..'),base=path.join(root,'.validation-release');
const cli=process.env.FOUNDRY_CLI_MODULE?await import(pathToFileURL(process.env.FOUNDRY_CLI_MODULE)):await import('@foundryvtt/foundryvtt-cli/lib/package.mjs');
const clean=v=>Array.isArray(v)?v.map(clean):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([k])=>k!=='_key').map(([k,v])=>[k,clean(v)])):v;
const read=async p=>{const a=[];for(const n of await fs.readdir(p))if(n.endsWith('.json'))a.push(JSON.parse(await fs.readFile(path.join(p,n),'utf8')));return clean(a.sort((a,b)=>a._id.localeCompare(b._id)));};
const manifest=JSON.parse(await fs.readFile(path.join(base,'module.json'),'utf8'));let documents=0;
for(const pack of manifest.packs){const dest=path.join(base,'extracted',pack.name);await fs.rm(dest,{force:true,recursive:true});await cli.extractPack(path.join(base,pack.path),dest,{log:false,clean:true});const actual=await read(dest),expected=await read(path.join(root,'packs-src',pack.name));if(!isDeepStrictEqual(actual,expected))throw new Error('Packaged compendium differs: '+pack.name);documents+=actual.length;}
const report={status:'passed',zipRootManifest:true,packagedLevelDBReopened:true,packs:manifest.packs.length,documents,sourceEquality:true,liveFoundryTested:false};
await fs.writeFile(path.join(root,'docs','release-validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
