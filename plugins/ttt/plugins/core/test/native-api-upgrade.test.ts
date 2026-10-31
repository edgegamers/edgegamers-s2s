import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {resolve} from 'node:path';
const archive=resolve(process.env.TTT_TEST_ARCHIVE??'dist/_edgegamers_ttt-core.s2sp');
const members=JSON.parse(execFileSync('python3',['-c','import zipfile,json,sys;z=zipfile.ZipFile(sys.argv[1]);print(json.dumps({n:z.read(n).decode() for n in z.namelist()}))',archive],{encoding:'utf8',maxBuffer:8*1024*1024}));
test('Core relinquishes the exact HE engine capability to the Items owner',()=>{
 assert.equal(members['engine-functions.json'],undefined);assert.equal(members['gamedata.json'],undefined);
 assert.equal((JSON.parse(members['manifest.json']).permissions??[]).includes('engine:calls'),false);
});
test('actual Core archive uses typed SDK event recipients including an empty authorized list',()=>{
 const recipients:number[][]=[];
 const unused:any=new Proxy(function(){},{get:(_t,k)=>k===Symbol.toPrimitive?()=> 'unused':unused,apply(){throw Error('unexpected host call');},construct:()=>({})});
 const context=vm.createContext({module:{exports:{}},console:{log(){}},require(name:string){
  if(name==='@s2script/sdk/events')return {HookResult:{Continue:0,Changed:1,Handled:2,Stop:3},Events:{setRecipients(slots:readonly number[]){recipients.push([...slots]);}}};return unused;
 }});
 vm.runInContext(members['plugin.js'],context);vm.runInContext('setDeathViewers([1,4]);setDeathViewers([]);',context);assert.deepEqual(recipients,[[1,4],[]]);
});
