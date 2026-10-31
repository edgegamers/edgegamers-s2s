import {initializeSettings,disposeSettings,getRoundSettings,refreshSettings} from './settings';
import {publish,use} from '@s2script/sdk/plugin';
import type {SpecialMethods} from '../api';
import {createFeatureAdapter,type FeatureAdapter} from '../../../packages/contracts/ordered.ts';
import {bindCore,unbindCore} from './runtime';
import {installSpecialRounds,isActive,startSpecialRounds,clearSpecialRounds,roundIds,tickSpecialRounds} from './rounds';
import {loadPhrases} from '../../../packages/contracts/phrases.ts';
let adapter:FeatureAdapter|null=null;
export function OnPluginStart():void {
  loadPhrases();
  const core=use('@edgegamers/ttt-core');
  bindCore(core);
  initializeSettings();
  const current=createFeatureAdapter('special',{
    emit:event=>core.dispatchDomain(event),has:kind=>core.hasDomain(kind),log:message=>console.log(message),
  });
  adapter=current;
  installSpecialRounds(current.bus);
  const methods:SpecialMethods={
    getRoundSettings,refreshSettings,
    isActive,startSpecialRounds:forced=>startSpecialRounds(forced),
    startRandomSpecialRounds:()=>startSpecialRounds(),clearSpecialRounds,roundIds,tickSpecialRounds,
    getHandlers:()=>current.getHandlers(),handleDomain:call=>current.handleDomain(call),
  };
  publish('@edgegamers/ttt-special',methods);
}
export function OnPluginEnd():void {
  // Cleanup must retain Core access until Suppressed is restored.
  try { clearSpecialRounds(); }
  finally { adapter?.bus.clear();adapter=null;disposeSettings();unbindCore(); }
}
