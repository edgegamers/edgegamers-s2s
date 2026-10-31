import vm from 'node:vm';
import {seededTranslations} from '../../../packages/contracts/test/translations-double.mjs';
export const copy=x=>JSON.parse(JSON.stringify(x));
export function fixture(code){let methods,now=1000;const ops=[];const game={epoch:1,roundsThisMap:3,state:2};const players=[0,1,2,3].map(slot=>({actor:{slot,steamId:'s'+slot,generation:1,roundEpoch:1},name:'P'+slot,role:slot===2?2:1,alive:true,participating:true}));const admins=new Set([3]);
 const core={getReportPlayers:()=>copy(players.map(p=>({...p,actor:{...p.actor,roundEpoch:game.epoch}}))),getGame:()=>copy(game),matchesActor:a=>players.some(p=>p.actor.slot===a.slot&&p.actor.steamId===a.steamId&&p.actor.generation===a.generation)&&a.roundEpoch===game.epoch,
 reportDidStrikeFirst:()=>false,authorizeReportAdmin:a=>core.matchesActor(a)&&admins.has(a.slot)?{name:'Admin'+a.slot}:null,
 slayReportDebtor:a=>{ops.push(['slay',a.slot]);return true;},formatReportPhrase:(a,k,args)=>k+':'+args.join(','),tellReportPlayer:(a,text)=>ops.push(['tell',a.slot,text]),presentReportPlayer:()=>false,notifyReportAdmins:(id,mode)=>ops.push(['notify',id,mode]),dispatchDomain:e=>copy(e),hasDomain:()=>true};
 const translations=seededTranslations();
 const module={exports:{}};class Clock extends Date{static now(){return now*1000;}}
 vm.runInNewContext(code,{module,Date:Clock,console:{log:x=>ops.push(['log',x])},require(n){if(n==='@s2script/sdk/translations')return translations;if(n==='@s2script/cs2')return {};if(n==='@s2script/sdk/plugin')return{use:()=>core,publish:(name,m)=>{if(name!=='@edgegamers/ttt-reports')throw Error('wrong publication');methods=m;}};throw Error(n);}});
 module.exports.OnPluginStart();return{get methods(){return methods;},core,players,game,admins,ops,actor:slot=>({...players.find(p=>p.actor.slot===slot).actor,roundEpoch:game.epoch}),time:t=>{now=t;},end:()=>module.exports.OnPluginEnd(),death:(victim=0,killer=1)=>methods.handleDomain({handler:'reports.death',kind:'death',payload:{slot:victim,killer,assister:-1,weapon:'awp',headshot:false}}),leave:slot=>methods.handleDomain({handler:'reports.leave',kind:'leave',payload:{slot}})};
}
