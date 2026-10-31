import {initializeSettings,disposeSettings,getRoundSettings,refreshSettings} from './settings';
import { publish, use } from '@s2script/sdk/plugin';
import type { KarmaMethods } from '../api';
import { createFeatureAdapter, type FeatureAdapter } from '../../../packages/contracts/ordered.ts';
import { bindCore, unbindCore } from './runtime';
import {loadPhrases} from '../../../packages/contracts/phrases.ts';
import {
  installKarma, karmaOf, adminSetKarma, timeoutRemaining,
  didStrikeFirst, suppressKarmaOnce, resetRound,
} from './karma';

let adapter: FeatureAdapter | null = null;

export function OnPluginStart(): void {
  loadPhrases();
  const core = use('@edgegamers/ttt-core');
  bindCore(core);
  initializeSettings();
  const current = createFeatureAdapter('karma', {
    emit: event => core.dispatchDomain(event),
    has: kind => core.hasDomain(kind),
    log: message => console.log(message),
  });
  adapter = current;
  installKarma(current.bus);
  const methods: KarmaMethods = {
    getRoundSettings, refreshSettings,
    karmaOf, adminSetKarma, timeoutRemaining, didStrikeFirst, suppressKarmaOnce, resetRound,
    getHandlers: () => current.getHandlers(),
    handleDomain: call => current.handleDomain(call),
  };
  publish('@edgegamers/ttt-karma', methods);
  // Core attaches these handlers in its original installation order, then replays
  // join for current occupants. Seeding here would race that handshake or double-load.
}

export function OnPluginEnd(): void {
  adapter?.bus.clear();
  adapter = null;
  disposeSettings();
  unbindCore();
}
