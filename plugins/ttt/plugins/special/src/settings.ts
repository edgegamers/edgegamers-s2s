import {config} from '@s2script/sdk/config';
import {Server} from '@s2script/sdk/server';
import {createOwnerConfig,readValues,type OwnerConfig} from '../../../packages/contracts/config.ts';
import type {SpecialRoundSettings} from '../api';
import {SPECS} from './settings-specs';
const FILE = '_edgegamers_ttt-special.json';
let settings: OwnerConfig | null = null;
function current(): OwnerConfig { if (!settings) throw new Error('Special owner settings unavailable'); return settings; }
export function initializeSettings(): void {
  disposeSettings();
  const initial=readValues(SPECS,spec=>spec.type==='string'?config.getString(spec.path):spec.type==='int'?config.getInt(spec.path):config.getFloat(spec.path));
  const next=createOwnerConfig(SPECS,initial,{
    read:()=>config.readFile(FILE),write:content=>config.writeFile(FILE,content),
    register:spec=>{if(!Server.registerCvar(spec.name,{type:spec.type,default:spec.default,help:spec.help,min:spec.min,max:spec.max})) throw new Error(`Special legacy alias unavailable: ${spec.name}`);},
    getAlias:name=>Server.getCvar(name),
    setAlias:(name,value)=>{if(!Server.setCvar(name,value)) throw new Error(`Special legacy alias mirror failed: ${name}`);},
    watchAlias:(name,handler)=>Server.onCvarChange(name,handler),log:message=>console.log(message),
  });
  settings=next;
  config.onChange(values=>next.acceptMaterialized(values));
}
export function disposeSettings(): void { settings?.dispose();settings=null; }
export function roundNumber(path:string):number { const value=current().roundValue(path);if(typeof value!=='number')throw new Error(`Expected numeric setting ${path}`);return value; }
function roundString(path:string):string { const value=current().roundValue(path);if(typeof value!=='string')throw new Error(`Expected string setting ${path}`);return value; }
export function settingsNumber(alias:string):number { const spec=SPECS.find(spec=>spec.name===alias);if(!spec||spec.type==='string')throw new Error(`Unknown numeric special alias: ${alias}`);return roundNumber(spec.path); }
export function getRoundSettings():SpecialRoundSettings {
  return {
    selection: {
      minimumRoundsBetween: roundNumber('selection.minimumRoundsBetween'),
      minimumPlayers: roundNumber('selection.minimumPlayers'),
      minimumRoundsAfterMap: roundNumber('selection.minimumRoundsAfterMap'),
      chance: roundNumber('selection.chance'),
      additionalRoundChance: roundNumber('selection.additionalRoundChance'),
    },
    lowGravity: {
      multiplier: roundNumber('lowGravity.multiplier'),
    },
    speed: {
      initialSeconds: roundNumber('speed.initialSeconds'),
      secondsPerKill: roundNumber('speed.secondsPerKill'),
      maximumSeconds: roundNumber('speed.maximumSeconds'),
    },
    rich: {
      startingCreditMultiplier: roundNumber('rich.startingCreditMultiplier'),
      earnedCreditMultiplier: roundNumber('rich.earnedCreditMultiplier'),
    },
  };
}
export function refreshSettings():SpecialRoundSettings { current().refresh();return getRoundSettings(); }
