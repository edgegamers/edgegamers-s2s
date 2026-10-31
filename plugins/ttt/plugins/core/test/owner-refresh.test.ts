import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import {SPECS} from '../../shop/src/settings-specs.ts';

const sourceDir = fileURLToPath(new URL('../src/', import.meta.url));
const mocks: Record<string, string> = {
  '@s2script/sdk/timers': 'export const delay=()=>new Promise(()=>{});',
  './ui-actor':'export const captureUiActor=()=>null,matchesUiActor=()=>false;',
  '@s2script/sdk/clients':'export const Clients={fromSlot:()=>null};',
  '@s2script/sdk/server': 'export const Server={gameTime:0,setCvar:()=>true,getCvar:()=>"0",command:()=>{}};',
  '@s2script/cs2': 'export const ChatColors={},Player={fromSlot:()=>null},Events={},Teams={},RoundEndReason={},WinPanelFinalEvent={};export const GameRules={get:()=>({warmupPeriod:false,setTimeRemaining:()=>{}})};',
  '../core/preframe': 'export const bindRoundEpoch=()=>{},nextPreFrame=()=>{};',
  '../core/cvars': 'export const cfg={minPlayers:2,countdownSeconds:15,roleCredits:[0,100,100,100]};export const n=()=>0,roundDuration=()=>120,refresh=()=>fixture.steps.push("core.refresh");',
  './cvars': 'export const refresh=()=>fixture.steps.push("core.refresh");',
  '../core/registry': 'export const syncRoster=()=>false,playerCount=()=>2,resyncAlive=()=>{},activeSlots=()=>[0,1],isConnected=()=>true,isAlive=()=>true,roleOf=()=>1,steamIdOf=()=>"",rotateRoles=()=>{},refreshName=()=>{},aliveCount=()=>0,nameOf=()=>"";',
  './roles': 'export const assignRoles=()=>0,revealTraitorBuddies=()=>{},roleName=()=>"I",stripRoundWeapons=()=>{};',
  './logger': 'export const clearLog=()=>{},printLogs=()=>{};',
  '../cs2/bodies': 'export const clearBodies=()=>{};',
  '../cs2/pawn': 'export const getHealth=()=>100,isPlayingTeam=()=>true,pawnOf=()=>null,respawn=()=>{},restoreFullHealth=()=>{},setPawnIsAlive=()=>{},teamOf=()=>2,tellAll=()=>{};',
  './teams': 'export const resetTeamsToT=()=>{},revealAllRoles=()=>{};',
  '../cs2/spoof': 'export const setSpoofingEnabled=()=>{};',
  '../core/msgs': 'export const msg=k=>k;',
  './settings': 'export const getRoundSettings=()=>fixture.shop,n=()=>0;',
  '@s2script/sdk/chat': 'export const Chat={toSlot:()=>{}};',
  '@s2script/sdk/translations': 'export const Translations={load(){},translate:(slot,key)=>key};',
};
const bundle = await build({
  stdin: { contents: `export {game,initGame,startGame} from './game/game.ts';export {installEconomy} from '../../shop/src/economy.ts';export {bindCore} from '../../shop/src/runtime.ts';export {initShop as initOwnerShop,balanceOf} from '../../shop/src/shop.ts';export {bindShopSettingsProvider} from './shop/settings.ts';export {bindKarmaProvider,getKarmaSettings,karmaOf,minimumKarma} from './karma/karma.ts';export {EventBus} from './core/bus.ts';`, resolveDir: sourceDir, loader: 'ts' },
  bundle: true, format: 'cjs', platform: 'node', write: false,
  plugins: [{ name: 'engine-and-owned-core-observations', setup(b) {
    b.onResolve({ filter: /.*/ }, (a) => a.path in mocks ? {path:a.path,namespace:'observations'}:undefined);
    b.onLoad({ filter: /.*/, namespace: 'observations' }, (a) => ({contents:mocks[a.path],loader:'js'}));
  } }],
});
test('accepted owner edits promote before Countdown and the next starting-credit decision', () => {
  const shop:any={};for(const spec of SPECS){const [section,key]=spec.path.split('.');(shop[section!]??={})[key!]=spec.default;}
  shop.economy.startInnocent=100;
  const fixture = {steps:[] as string[], shop};
  const module = {exports:{} as any};
  runInContext(bundle.outputFiles[0]!.text, createContext({fixture,module,exports:module.exports,console}));
  const {EventBus,initGame,startGame,game,installEconomy,bindCore,initOwnerShop,balanceOf,bindShopSettingsProvider,bindKarmaProvider,getKarmaSettings,karmaOf,minimumKarma}=module.exports;
  const bus=new EventBus();initGame(bus);initOwnerShop(bus);
  bindCore({activeSlots:()=>[0,1],roleOf:()=>1,isAlive:()=>true,isConnected:()=>true,nameOf:()=>'',getGame:()=>game,getKarmaValue:karmaOf,getKarmaMinimum:minimumKarma,formatPhrase:(key:string)=>key});
  installEconomy(bus);
  bindShopSettingsProvider({getRoundSettings:()=>fixture.shop,refreshSettings:()=>{fixture.steps.push('shop.refresh');fixture.shop.economy.startInnocent=125;return fixture.shop;}});
  let active=0, pending=40;
  const settings=()=>({defaultKarma:50,minimumKarma:active,timeoutThreshold:20,timeoutRounds:4,warningWindowHours:24,perRound:1,perRoundWin:1});
  bindKarmaProvider({getRoundSettings:settings,refreshSettings:()=>{fixture.steps.push('karma.refresh');active=pending;return settings();},karmaOf:()=>50});
  assert.equal(getKarmaSettings().karmaMin,0);
  bus.on('gameState',(ev:{state:number})=>{if(ev.state!==1)return;fixture.steps.push('countdown');bus.emit('roleAssigned',{slot:0,role:1});});
  startGame();
  assert.deepEqual(fixture.steps,['core.refresh','karma.refresh','shop.refresh','countdown']);
  assert.equal(getKarmaSettings().karmaMin,40);
  assert.equal(balanceOf(0),125); // karma90% reaches the unchanged curve's full starting credit.
});
