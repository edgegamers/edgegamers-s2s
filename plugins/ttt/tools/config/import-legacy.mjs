#!/usr/bin/env node
/** Offline only: parses selected old ConVars as data. Never executes cfg commands. Node24+. */
import {readFileSync,writeFileSync,existsSync,mkdirSync,renameSync,unlinkSync,statSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {SPECS as karma} from '../../plugins/karma/src/settings-specs.ts';
import {SPECS as special} from '../../plugins/special/src/settings-specs.ts';
import {SPECS as core,CANONICAL_FIELDS as coreFields} from '../../plugins/core/src/core/settings-specs.ts';
import {SPECS as world} from '../../plugins/world/src/settings-specs.ts';
import {SPECS as bodies} from '../../plugins/bodies/src/settings-specs.ts';
import {SPECS as shop} from '../../plugins/shop/src/settings-specs.ts';
import {parseJsonc,parseLegacy,normalizeValues,serializeValues} from '../../packages/contracts/config.ts';
const LIMIT=1024*1024;
const OWNERS=[['karma',karma],['special',special],['shop',shop],['core',core],['world',world],['bodies',bodies]];
const SPECS=new Map(OWNERS.flatMap(([,specs])=>specs.map(spec=>[spec.name,spec])));
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&!JSON.isRawJSON(value);
const hash=text=>createHash('sha256').update(text).digest('hex');
function boundedRead(path){if(statSync(path).size>LIMIT)throw Error(`Input exceeds ${LIMIT} bytes: ${path}`);const bytes=readFileSync(path);if(bytes.length>LIMIT)throw Error(`Input exceeds ${LIMIT} bytes: ${path}`);const text=bytes.toString('utf8');if(!Buffer.from(text,'utf8').equals(bytes))throw Error(`Input is not UTF-8: ${path}`);return text;}
function missing(object,path){let value=object;for(const part of path.split('.')){if(!record(value))return false;if(!Object.hasOwn(value,part))return true;value=value[part];}return false;}
function set(object,path,value){const parts=path.split('.');let o=object;for(const part of parts.slice(0,-1)){if(!record(o[part]))o[part]={};o=o[part];}o[parts.at(-1)]=value;}
function stripComment(line){let quoted=false,escaped=false;for(let i=0;i<line.length;i++){if(quoted){if(escaped)escaped=false;else if(line[i]==='\\')escaped=true;else if(line[i]==='"')quoted=false;}else if(line[i]==='"')quoted=true;else if(line[i]==='/'&&line[i+1]==='/')return line.slice(0,i);}return line;}
// Node24 raw JSON preserves existing number tokens. Reprinting80.0 as80 would
// activate an integer setting that the stock SDK intentionally defaulted before.
function parseCanonical(text){return JSON.parse(text.split('\n').map(stripComment).join('\n'),(_key,value,context)=>typeof value==='number'?JSON.rawJSON(context.source):value);}
function parseLegacyInput(text){
 const values=new Map(),ignored=[];
 if(text.trimStart().startsWith('{')){
  const object=parseJsonc(text);if(!object||typeof object!=='object'||Array.isArray(object))throw Error('Legacy JSON export must be a name/value object');
  for(const [name,value]of Object.entries(object)){if(SPECS.has(name)&&(typeof value==='string'||typeof value==='number'||(typeof value==='boolean'&&SPECS.get(name).type==='bool')))values.set(name,String(value));else ignored.push(name);}
 }else{
  const lines=text.split(/\r?\n/);if(lines.length>10000)throw Error('Legacy input exceeds10000 lines');
  for(let i=0;i<lines.length;i++){
   const line=stripComment(lines[i]).trim();if(!line)continue;
   const m=/^(?:sm_cvar\s+)?(sm_ttt_\w+)\s+(?:"((?:\\.|[^"\\])*)"|([^\s;]+))\s*$/.exec(line);
   if(!m||!SPECS.has(m[1])){ignored.push(`line ${i+1}`);continue;}
   const value=m[2]!==undefined?JSON.parse('"'+m[2]+'"'):m[3];if(value.length>8192)throw Error(`Alias value too long at line ${i+1}`);values.set(m[1],value);
  }
 }
 return {values,ignored};
}
function main(){
 const args=process.argv.slice(2);let input,outDir,receiptPath;let write=false,merge=false,migrateBodies=false;
 for(let i=0;i<args.length;i++){const a=args[i];if(a==='--write')write=true;else if(a==='--dry-run')write=false;else if(a==='--merge-missing')merge=true;else if(a==='--migrate-body-settings')migrateBodies=true;else if(['--input','--out-dir','--receipt'].includes(a)){const v=args[++i];if(!v||v.startsWith('--'))throw Error(`Missing ${a} value`);if(a==='--input')input=resolve(v);else if(a==='--out-dir')outDir=resolve(v);else receiptPath=resolve(v);}else throw Error(`Unknown option: ${a}`);}
 if(!input||!outDir)throw Error('Usage: import-legacy.mjs --input old.cfg|export.json --out-dir configs [--write] [--merge-missing] [--receipt receipt.json]');
 if(migrateBodies&&!merge)throw Error('--migrate-body-settings requires --merge-missing');
 const corePath=join(outDir,'_edgegamers_ttt-core.json');
 const oldCore=migrateBodies&&existsSync(corePath)?parseCanonical(boundedRead(corePath)):null;
 const raw=boundedRead(input),parsed=parseLegacyInput(raw);const files=[];
 // Plan/validate all owners before any writes.
 for(const [owner,specs]of OWNERS){
  const path=join(outDir,`_edgegamers_ttt-${owner}.json`);if(path===input)throw Error('Input path must not be a canonical output');const exists=existsSync(path),old=exists?boundedRead(path):null;
  if(exists&&!merge){files.push({owner,path,status:'preserved',inputCanonicalSha256:hash(old)});continue;}
  let values=exists?parseCanonical(old):normalizeValues(owner==='core'?[...specs,...coreFields]:specs,{});if(!record(values))throw Error(`Canonical file is not an object: ${path}`);
  const imported=[],migrated=[];
  // Explicit offline ownership migration: target canonical > old Core canonical > alias input.
  // Preserve raw numeric tokens and malformed ancestor choices; never edit/remove old Core data.
  if(owner==='bodies'&&oldCore&&record(oldCore)&&Object.hasOwn(oldCore,'bodies')){
   if(!record(oldCore.bodies)){if(missing(exists?values:{},'bodies')){values.bodies=oldCore.bodies;migrated.push('bodies');}}
   else for(const spec of specs){const key=spec.path.slice('bodies.'.length);if(Object.hasOwn(oldCore.bodies,key)&&missing(exists?values:{},spec.path)){set(values,spec.path,oldCore.bodies[key]);migrated.push(spec.path);}}
  }
  for(const spec of specs){if(!parsed.values.has(spec.name)||migrated.includes(spec.path)||migrated.includes('bodies')||(exists&&!missing(values,spec.path)))continue;set(values,spec.path,parseLegacy(spec,parsed.values.get(spec.name)));imported.push({alias:spec.name,key:spec.path});}
  if(migrateBodies&&owner==='core'&&exists&&imported.length===0){files.push({owner,path,status:'preserved',inputCanonicalSha256:hash(old)});continue;}
  const content=serializeValues(values);files.push({owner,path,status:exists?'merge-missing':'create',inputCanonicalSha256:old===null?null:hash(old),outputSha256:hash(content),values,imported,migrated,content});
 }
 if(receiptPath&&(receiptPath===input||files.some(f=>f.path===receiptPath)))throw Error('Receipt path must not replace input or canonical files');
 if(write){
  mkdirSync(outDir,{recursive:true});
  for(const file of files){
   if(file.status==='preserved')continue;
   if(file.status==='create')writeFileSync(file.path,file.content,{flag:'wx',mode:0o600});
   else{
    if(hash(boundedRead(file.path))!==file.inputCanonicalSha256)throw Error(`Canonical file changed after planning: ${file.path}`);
    const temporary=file.path+`.import-${process.pid}.tmp`;
    try{writeFileSync(temporary,file.content,{flag:'wx',mode:0o600});renameSync(temporary,file.path);}finally{if(existsSync(temporary))unlinkSync(temporary);}
   }
   if(hash(boundedRead(file.path))!==file.outputSha256)throw Error(`Canonical readback mismatch: ${file.path}`);
  }
 }
 const receipt={version:1,dryRun:!write,input,inputSha256:hash(raw),mergeMissing:merge,migrateBodySettings:migrateBodies,ignored:parsed.ignored,files:files.map(({content,...file})=>file)};
 const output=JSON.stringify(receipt,null,2)+'\n';if(receiptPath){mkdirSync(dirname(receiptPath),{recursive:true});writeFileSync(receiptPath,output,{flag:'wx',mode:0o600});}process.stdout.write(output);
}
try{main();}catch(error){process.stderr.write(`Legacy config import failed: ${error.message}\n`);process.exitCode=1;}
