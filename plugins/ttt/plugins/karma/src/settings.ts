import {config} from '@s2script/sdk/config';
import {Server} from '@s2script/sdk/server';
import {createOwnerConfig,readValues,type OwnerConfig} from '../../../packages/contracts/config.ts';
import type {KarmaRoundSettings} from '../api';
import {SPECS} from './settings-specs';
const FILE = '_edgegamers_ttt-karma.json';
let settings: OwnerConfig | null = null;
function current(): OwnerConfig { if (!settings) throw new Error('Karma owner settings unavailable'); return settings; }
export function initializeSettings(): void {
  disposeSettings();
  const initial=readValues(SPECS,spec=>spec.type==='string'?config.getString(spec.path):spec.type==='int'?config.getInt(spec.path):config.getFloat(spec.path));
  const next=createOwnerConfig(SPECS,initial,{
    read:()=>config.readFile(FILE),write:content=>config.writeFile(FILE,content),
    register:spec=>{if(!Server.registerCvar(spec.name,{type:spec.type,default:spec.default,help:spec.help,min:spec.min,max:spec.max})) throw new Error(`Karma legacy alias unavailable: ${spec.name}`);},
    getAlias:name=>Server.getCvar(name),
    setAlias:(name,value)=>{if(!Server.setCvar(name,value)) throw new Error(`Karma legacy alias mirror failed: ${name}`);},
    watchAlias:(name,handler)=>Server.onCvarChange(name,handler),log:message=>console.log(message),
  });
  settings=next;
  config.onChange(values=>next.acceptMaterialized(values));
}
export function disposeSettings(): void { settings?.dispose();settings=null; }
export function roundNumber(path:string):number { const value=current().roundValue(path);if(typeof value!=='number')throw new Error(`Expected numeric setting ${path}`);return value; }
function roundString(path:string):string { const value=current().roundValue(path);if(typeof value!=='string')throw new Error(`Expected string setting ${path}`);return value; }
export function settingsNumber(alias:string):number { const spec=SPECS.find(spec=>spec.name===alias);if(!spec||spec.type==='string')throw new Error(`Unknown numeric karma alias: ${alias}`);return roundNumber(spec.path); }
export function getRoundSettings():KarmaRoundSettings {
  return {
    databaseConnection: roundString('databaseConnection'),
    defaultKarma: roundNumber('defaultKarma'),
    minimumKarma: roundNumber('minimumKarma'),
    timeoutThreshold: roundNumber('timeoutThreshold'),
    timeoutRounds: roundNumber('timeoutRounds'),
    warningWindowHours: roundNumber('warningWindowHours'),
    perRound: roundNumber('perRound'),
    perRoundWin: roundNumber('perRoundWin'),
    scoring: {
      innocentOnTraitor: roundNumber('scoring.innocentOnTraitor'),
      traitorOnDetective: roundNumber('scoring.traitorOnDetective'),
      innocentOnInnocent: {
        killerInnocent: roundNumber('scoring.innocentOnInnocent.killerInnocent'),
        killerGuilty: roundNumber('scoring.innocentOnInnocent.killerGuilty'),
        victimInnocent: roundNumber('scoring.innocentOnInnocent.victimInnocent'),
        victimGuilty: roundNumber('scoring.innocentOnInnocent.victimGuilty'),
      },
      traitorOnTraitor: {
        killerInnocent: roundNumber('scoring.traitorOnTraitor.killerInnocent'),
        killerGuilty: roundNumber('scoring.traitorOnTraitor.killerGuilty'),
        victimInnocent: roundNumber('scoring.traitorOnTraitor.victimInnocent'),
        victimGuilty: roundNumber('scoring.traitorOnTraitor.victimGuilty'),
      },
      innocentOnDetective: {
        killerInnocent: roundNumber('scoring.innocentOnDetective.killerInnocent'),
        killerGuilty: roundNumber('scoring.innocentOnDetective.killerGuilty'),
        victimInnocent: roundNumber('scoring.innocentOnDetective.victimInnocent'),
        victimGuilty: roundNumber('scoring.innocentOnDetective.victimGuilty'),
      },
    },
  };
}
export function refreshSettings():KarmaRoundSettings { current().refresh();return getRoundSettings(); }
export function lowKarmaCommand():string { const value=current().liveValue('lowKarmaCommand');if(typeof value!=='string')throw new Error('Invalid low karma command');return value; }
