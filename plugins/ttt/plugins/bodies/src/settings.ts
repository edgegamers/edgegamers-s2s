import {config} from '@s2script/sdk/config';
import {Server} from '@s2script/sdk/server';
import {createOwnerConfig,readValues,type OwnerConfig} from '../../../packages/contracts/config.ts';
import type {BodySettings} from '../api';
import {SPECS} from './settings-specs';
let settings:OwnerConfig|null=null;
function current():OwnerConfig {if(!settings)throw Error('Body owner settings unavailable');return settings;}
export function initializeSettings():void {
 disposeSettings();
 const initial=readValues(SPECS,s=>s.type==='bool'?config.getBool(s.path):s.type==='float'?config.getFloat(s.path):config.getInt(s.path));
 const next=createOwnerConfig(SPECS,initial,{
  read:()=>config.readFile('_edgegamers_ttt-bodies.json'),write:text=>config.writeFile('_edgegamers_ttt-bodies.json',text),
  register:s=>{if(!Server.registerCvar(s.name,{type:s.type,default:s.default,help:s.help,min:s.min,max:s.max}))throw Error('Body alias unavailable: '+s.name);},
  getAlias:n=>Server.getCvar(n),setAlias:(n,v)=>{if(!Server.setCvar(n,v))throw Error('Body alias mirror failed: '+n);},
  watchAlias:(n,h)=>Server.onCvarChange(n,h),log:m=>console.log(m),
 });
 settings=next;config.onChange(values=>next.acceptMaterialized(values));
}
export function disposeSettings():void {settings?.dispose();settings=null;}
function boolean(path:string):boolean {const v=current().roundValue(path);if(typeof v!=='boolean')throw Error('Expected Body boolean: '+path);return v;}
function number(path:string):number {const v=current().roundValue(path);if(typeof v!=='number')throw Error('Expected Body number: '+path);return v;}
export function getRoundSettings():BodySettings {return {bodiesEnabled:boolean('bodies.enabled'),bodyHidePawn:boolean('bodies.hidePawn'),bodySettle:boolean('bodies.settle'),propPickup:boolean('bodies.propPickup'),carryBodyOffset:number('bodies.carryOffset')};}
export function refreshSettings():BodySettings {current().refresh();return getRoundSettings();}
