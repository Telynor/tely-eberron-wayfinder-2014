import fs from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
const root=path.resolve(import.meta.dirname,"..");
const cli=process.env.FOUNDRY_CLI_MODULE
  ? await import(pathToFileURL(path.resolve(process.env.FOUNDRY_CLI_MODULE)))
  : await import("@foundryvtt/foundryvtt-cli/lib/package.mjs");
const manifest=JSON.parse(await fs.readFile(path.join(root,"module.json"),"utf8"));
const clean=v=>{
 if(Array.isArray(v))return v.map(clean);
 if(v&&typeof v==="object")return Object.fromEntries(Object.entries(v).filter(([k])=>k!=="_key").map(([k,x])=>[k,clean(x)]));
 return v;
};
let documents=0;
for(const pack of manifest.packs){
 const src=path.join(root,"packs-src",pack.name),dest=path.join(root,pack.path),round=path.join(root,".validation-roundtrip",pack.name);
 await fs.rm(dest,{recursive:true,force:true});await fs.rm(round,{recursive:true,force:true});
 await cli.compilePack(src,dest,{recursive:false,log:false});
 await cli.extractPack(dest,round,{log:false,clean:true});
 const read=async(dir)=>{
  const docs=[];for(const f of await fs.readdir(dir))if(f.endsWith(".json"))docs.push(JSON.parse(await fs.readFile(path.join(dir,f),"utf8")));
  return docs.sort((a,b)=>a._id.localeCompare(b._id));
 };
 const source=clean(await read(src)),extracted=clean(await read(round));
 // Object key order is immaterial; embedded-document order is preserved.
 const {isDeepStrictEqual}=await import("node:util");
 if(!isDeepStrictEqual(source,extracted))throw new Error(`Compendium round-trip differs: ${pack.name}`);
 documents+=source.length;console.log(`${pack.name}: ${source.length} documents; LevelDB round-trip passed`);
}
await fs.mkdir(path.join(root,"docs"),{recursive:true});
await fs.writeFile(path.join(root,"docs","pack-validation.json"),JSON.stringify({compiler:"@foundryvtt/foundryvtt-cli 3.0.5",format:"LevelDB",packs:manifest.packs.length,documents,roundTrip:"passed",liveFoundryTested:false},null,2)+"\n");
