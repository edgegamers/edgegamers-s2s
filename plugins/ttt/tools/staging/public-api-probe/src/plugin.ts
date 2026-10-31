import {ALIASES} from './aliases';
import { use, createScope } from '@s2script/sdk/plugin';
import { command, type CommandInvocation } from '@s2script/sdk/commands';
import { Clients, type Client } from '@s2script/sdk/clients';
import { Server } from '@s2script/sdk/server';
import { Engine } from '@s2script/sdk/unsafe';
import { SDKHook, SDKUnhook } from '@s2script/sdk/sdkhooks';
import type { DamageInfo } from '@s2script/sdk/damage';
import { Entity, type EntityRef } from '@s2script/sdk/entity';
import { readCaptures } from './capture-read';
import { createWeaponProbe } from './weapon-probe';
import { readPawnByte318 } from './byte318';
import { createGrantReadAdapter } from './grant-read-adapter';
import { registerGrantObserver } from './grant-register.mjs';
import { registerBotMotion } from './bot-motion';
declare const __s2_schema_offset: (className: string, field: string) => number;
import { Player,wrapEntity } from '@s2script/cs2';

const he = Engine.function('createHeGrenade');
let active = false, epoch = 0, outputId = 0;
type Target = { client: Client; slot: number; userId: number; controller: EntityRef; pawn: EntityRef; map: string; epoch: number };
let weaponProbe: ReturnType<typeof createWeaponProbe<Target>> | null = null;
let grantObserver: {stop():void;close():void} | null = null;
let botMotion: {stop(reason?:string):void;close():void} | null = null;
type Ring = { target: Target; refs: EntityRef[]; deadline: number };
let ring: Ring | null = null;
let watch: { target: Target; callback: (info: DamageInfo) => void; count: number; deadline: number } | null = null;
function emit(value: unknown): void {
  // Fixed chunks stay below the 2047-byte console envelope even at worst JSON escaping.
  const text = JSON.stringify(value), id = ++outputId, count = Math.ceil(text.length / 240);
  for (let i = 0; i < count; i++) console.log(JSON.stringify({ probe: id, part: i + 1, total: count, text: text.slice(i * 240, (i + 1) * 240) }));
}
function safeStage(): boolean {
  return active && Server.getCvar('hostname') === 's2s-ttt-staging' && Server.getCvar('sv_lan') === '1'
    && Clients.all().every(c => !c.isValid() || c.isBot);
}
function admitted(inv: CommandInvocation, argc: number): boolean {
  if (inv.callerSlot !== -1 || inv.replySource !== 'server') return false;
  if (inv.argCount !== argc || !safeStage()) { inv.reply('public-probe refused: exact arguments, staging hostname, sv_lan 1 and zero humans required'); return false; }
  return true;
}
function same(a: EntityRef | null | undefined, b: EntityRef): boolean {
  return !!a && a.id === b.id && a.index === b.index && a.isValid() && b.isValid();
}
function current(t: Target): boolean {
  if (!active || t.epoch !== epoch || t.map !== Server.mapName || !t.client.isValid() || !t.client.isBot) return false;
  const client = Clients.fromSlot(t.slot), player = Player.fromSlot(t.slot);
  return !!client && client.isValid() && client.isBot && client.userId === t.userId
    && !!player && same(player.ref, t.controller) && same(player.pawn?.ref, t.pawn)
    && t.client.isValid() && t.epoch === epoch && t.map === Server.mapName;
}
function target(inv: CommandInvocation): Target | null {
  if (!/^\d{1,2}$/.test(inv.arg(0))) return null;
  const slot = Number(inv.arg(0)), client = Clients.fromSlot(slot), player = Player.fromSlot(slot), pawn = player?.pawn;
  if (!client?.isValid() || !client.isBot || !player || !pawn?.isValid || (pawn.health ?? 0) <= 0) return null;
  const t = { client, slot, userId: client.userId, controller: player.ref, pawn: pawn.ref, map: Server.mapName, epoch };
  return current(t) ? t : null;
}
function copyRef(ref: EntityRef | null): { id: number; index: number } | null {
  return ref?.isValid() ? { id: ref.id, index: ref.index } : null;
}
function cleanup(reason: string): void {
  const prior = ring; ring = null;
  if (!prior) return;
  let alreadyGone = 0, requested = 0, refused = 0, errors = 0;
  for (const ref of prior.refs) {
    try { if (!ref.isValid()) alreadyGone++; else if (ref.acceptInput('Kill')) requested++; else refused++; }
    catch { errors++; }
  }
  emit({ event: 'cleanup', reason, tracked: prior.refs.length, alreadyGone, killRequestsAccepted: requested, refused, errors });
}
function stopWatch(): void {
  const prior = watch; watch = null;
  if (prior) { try { SDKUnhook(prior.target.pawn, 'OnTakeDamage', prior.callback); } catch { emit({ event: 'unhook-error' }); } }
}
export function OnPluginStart(): void {
  active = true; epoch++;
  const core = use('@edgegamers/ttt-core'), karma = use('@edgegamers/ttt-karma');
  weaponProbe = createWeaponProbe({admitted,target,current,safeStage,
    roundEpoch:()=>core.getGame().epoch,roundState:()=>core.getGame().state,
    readPlayer:slot=>Player.fromSlot(slot),
    possessed:player=>wrapEntity('CBasePlayerController',player.ref).pawn,
    now:()=>Date.now(),emit,readPawnByte318});
  command('ttt_public_weapon',inv=>weaponProbe?.command(inv));
  const grantReader=createGrantReadAdapter({clients:Clients,player:slot=>Player.fromSlot(slot),
    possessed:player=>wrapEntity('CBasePlayerController',player.ref).pawn,
    stamp:()=>{const game=core.getGame();return {active,probeEpoch:epoch,map:Server.mapName,
      roundEpoch:game.epoch,roundState:game.state,owner:core};}});
  grantObserver=registerGrantObserver({command,createScope,...grantReader,now:()=>Date.now(),emit,
    admit:()=>active&&Server.getCvar('hostname')==='s2s-ttt-staging'});
  botMotion=registerBotMotion({clients:Clients,player:slot=>Player.fromSlot(slot),
    possessed:player=>wrapEntity('CBasePlayerController',player.ref).pawn,command,createScope,
    now:()=>Date.now(),emit,admit:()=>active&&Server.getCvar('hostname')==='s2s-ttt-staging',
    stamp:()=>{const game=core.getGame();return {active,probeEpoch:epoch,map:Server.mapName,
      roundEpoch:game.epoch,roundState:game.state,owner:core};}});
  const reports=use('@edgegamers/ttt-reports'),items=use('@edgegamers/ttt-items'),bodies=use('@edgegamers/ttt-bodies'),world=use('@edgegamers/ttt-world'),shop=use('@edgegamers/ttt-shop'),special=use('@edgegamers/ttt-special'),ui=use('@edgegamers/ttt-ui');
  // Communication has no read-only service method. Resolution proves dependency binding only.
  use('@edgegamers/ttt-communication');
  command('ttt_staging_identity',inv=>{
    if(inv.callerSlot!==-1||inv.replySource!=='server')return;
    if(inv.argCount!==0){inv.reply('staging identity refused: no arguments');return;}
    try {
      const game=core.getGame();
      const players=core.getWorldPlayers().slice(0,64).map(({actor})=>({slot:actor.slot,generation:actor.generation,roundEpoch:actor.roundEpoch}));
      if(core.getGame().epoch!==game.epoch){inv.reply('staging identity changed while sampling; retry');return;}
      emit({state:game.state,epoch:game.epoch,roundsThisMap:game.roundsThisMap,players});
    }catch {inv.reply('staging identity unavailable');}
  });
  command('ttt_staging_weapons',inv=>{
    if(inv.callerSlot!==-1||inv.replySource!=='server'||inv.argCount!==0||!active||Server.getCvar('hostname')!=='s2s-ttt-staging')return;
    const startEpoch=epoch,map=Server.mapName,round=core.getGame().epoch;
    try {
      const rows=[];
      for(const client of Clients.all().slice(0,64)){
        if(!client.isValid())continue;
        const player=Player.fromSlot(client.slot),pawn=player?.pawn;
        if(!player||!pawn?.isValid)continue;
        const possessed=wrapEntity('CBasePlayerController',player.ref).pawn;
        const w=pawn.activeWeapon,ws=pawn.weaponServices,m=pawn.movementServices;
        const row={slot:client.slot,bot:client.isBot,alive:(pawn.health??0)>0&&pawn.lifeState===0,
          possessed:same(possessed,pawn.ref),activeDef:w?.attributeManager.item.itemDefinitionIndex??null,
          heldDefs:pawn.weapons.slice(0,32).map(v=>v.attributeManager.item.itemDefinitionIndex),
          activeOwned:!!w&&w.isValid()&&same(w.ownerEntity,pawn.ref),deployTick:w?.deployTick??null,
          moveType:pawn.moveType,flags:pawn.flags,maxSpeed:pawn.maxSpeed,
          given:ws?.isBeingGivenItem??null,autoDeployDisabled:ws?.disableAutoDeploy??null,
          buttons:pawn.buttons,commandNumber:m?.lastCommandNumberProcessed??null,
          forward:m?.cmdForwardMove??null,left:m?.cmdLeftMove??null};
        if(client.isValid()&&same(player.pawn?.ref,pawn.ref)&&startEpoch===epoch&&map===Server.mapName&&core.getGame().epoch===round)rows.push(row);
      }
      if(startEpoch===epoch&&map===Server.mapName&&core.getGame().epoch===round)emit({event:'staging-weapon-state',gameTime:Server.gameTime,rows});
    }catch {emit({event:'staging-weapon-state-unavailable'});}
  });
  command('ttt_staging_pawn',inv=>{
    if(inv.callerSlot!==-1||inv.replySource!=='server'||inv.argCount!==0)return;
    const startEpoch=epoch,map=Server.mapName,round=core.getGame().epoch;
    try {
      const rows=[];
      for(const client of Clients.all()){
        if(!client.isValid()||client.isBot)continue;
        const player=Player.fromSlot(client.slot),pawn=player?.pawn;
        const view=core.getWorldPlayers(client.slot).find(row=>row.actor.slot===client.slot);
        const possessed=player?wrapEntity('CBasePlayerController',player.ref).pawn:null,movement=pawn?.movementServices;
        const weapon=pawn?.activeWeapon,weaponServices=pawn?.weaponServices;
        const observation={slot:client.slot,controllerPresent:!!player,pawnPresent:!!pawn,
          possessedPawnPresent:!!possessed,possessedMatchesPlayerPawn:!!pawn&&same(possessed,pawn.ref),
          observerIsPossessed:!!player?.observerPawn&&same(possessed,player.observerPawn),
          pawnControllerMatchesPlayer:!!player&&same(pawn?.controller?.ref,player.ref),
          inSwitchTeam:player?.inSwitchTeam??null,justBecameSpectator:player?.justBecameSpectator??null,desiredObserverMode:player?.desiredObserverMode??null,
          renderMode:pawn?.renderMode??null,renderAlpha:pawn?.render==null?null:(pawn.render>>>24)&255,effects:pawn?.effects??null,
          buttons:pawn?.buttons??null,commandNumber:movement?.lastCommandNumberProcessed??null,cmdForward:movement?.cmdForwardMove??null,cmdLeft:movement?.cmdLeftMove??null,forward:movement?.forwardMove??null,left:movement?.leftMove??null,
          controllerAlive:player?.pawnIsAlive??null,controllerHealth:player?.pawnHealth??null,
          pawnValid:pawn?.isValid??false,health:pawn?.health??null,lifeState:pawn?.lifeState??null,
          moveType:pawn?.moveType??null,actualMoveType:pawn?.actualMoveType??null,flags:pawn?.flags??null,
          maxSpeed:pawn?.maxSpeed??null,weaponCount:pawn?.weapons.length??0,activeWeaponPresent:!!pawn?.activeWeapon,
          hideHUD:pawn?.hideHUD??null,playerLocked:pawn?.playerLocked??null,isBuyMenuOpen:pawn?.isBuyMenuOpen??null,
          activeWeaponValid:weapon?.isValid()??false,activeWeaponOwnedByPawn:!!pawn&&same(weapon?.ownerEntity,pawn.ref),
          activeWeaponEffects:weapon?.effects??null,activeWeaponRenderMode:weapon?.renderMode??null,
          disableAutoDeploy:weaponServices?.disableAutoDeploy??null,isBeingGivenItem:weaponServices?.isBeingGivenItem??null,nextAttack:weaponServices?.nextAttack??null,
          logicalAlive:view?.alive??null,participating:view?.participating??null,
          shopOpen:view?ui.isShopOpen(view.actor):null};
        if(client.isValid()&&(!player||player.ref.isValid())&&(!pawn||same(player?.pawn?.ref,pawn.ref))&&startEpoch===epoch&&map===Server.mapName&&core.getGame().epoch===round)rows.push(observation);
      }
      if(startEpoch===epoch&&map===Server.mapName&&core.getGame().epoch===round)emit({event:'human-pawn-state',gameTime:Server.gameTime,rows});
    }catch {emit({event:'human-pawn-state-unavailable'});}
  });
  command('ttt_staging_capture',inv=>{
    if(inv.callerSlot!==-1||inv.replySource!=='server'||inv.argCount!==0)return;
    const startEpoch=epoch,map=Server.mapName,round=core.getGame().epoch;
    const current=()=>active&&epoch===startEpoch&&Server.mapName===map&&core.getGame().epoch===round;
    try {
      if(typeof __s2_schema_offset!=='function'){emit({event:'human-hud-capture-unavailable'});return;}
      const rows=[];
      for(const client of Clients.all().slice(0,64)){
        if(!client.isValid()||client.isBot)continue;
        rows.push(readCaptures({entity:Entity,schemaOffset:__s2_schema_offset,current:()=>current()&&client.isValid()},client.slot));
      }
      if(current())emit({event:'human-hud-capture',rows});
    }catch {emit({event:'human-hud-capture-unavailable'});}
  });
  command('ttt_public_owners',inv=>{
    if(!admitted(inv,0))return;
    const startEpoch=epoch,map=Server.mapName;
    try {
      const game=core.getGame(),reportHandlers=reports.getHandlers(),itemHandlers=items.getHandlers();
      const queue=reports.getQueue(),queueBefore=JSON.stringify(queue);
      if(queue.rows[0])queue.rows[0].reason='__probe_copy__';else queue.rows.push({id:-1,filed:0,round:0,reporterSlot:-1,reporterName:'',accusedSlot:-1,accusedName:'',accusedSteamId:'',reason:'',verdict:0,slays:0,ruledBy:'',priorGuilty:0,suggestedSlays:0});
      const reportQueueCopied=JSON.stringify(reports.getQueue())===queueBefore;
      const b=bodies.getRoundSettings(),before=JSON.stringify(b);b.bodiesEnabled=!b.bodiesEnabled;
      const bodySettingsCopied=JSON.stringify(bodies.getRoundSettings())===before;
      // Invoke every settings owner without emitting private database/command/config values.
      const k=karma.getRoundSettings(),s=special.getRoundSettings(),w=world.getRoundSettings(),h=shop.getRoundSettings();
      const settingsOwnersReadable=[k,s,w,h].every(v=>v!==null&&typeof v==='object');
      const invalidAliases:string[]=[];
      for(const alias of ALIASES){const value=Server.getCvar(alias.name);if(alias.type==='bool'?!['0','1','true','false'].includes(value):alias.type!=='string'&&(value.trim()===''||!Number.isFinite(Number(value))))invalidAliases.push(alias.name);}
      const players=core.getReportPlayers().slice(0,64),uiStates=players.slice(0,3).filter(p=>core.matchesActor(p.actor)).map(p=>({slot:p.actor.slot,shop:ui.isShopOpen(p.actor),reports:ui.isRdmOpen(p.actor),logs:ui.isLogsOpen(p.actor)}));
      const c4=items.c4Count(),bodyStatus=bodies.getStatus();
      if(startEpoch!==epoch||map!==Server.mapName||core.getGame().epoch!==game.epoch||!safeStage())return;
      const expectedReports=['reports.death','reports.leave'],expectedItems=['effects.damage','effects.bodyCreate','effects.gameState','weaponfx.gameState'];
      emit({event:'ten-owner-readiness',game,reportHandlers,itemHandlers,exactReportHandlers:reportHandlers.length===2&&expectedReports.every(id=>reportHandlers.includes(id as typeof reportHandlers[number])),exactItemHandlers:itemHandlers.length===4&&expectedItems.every(id=>itemHandlers.includes(id as typeof itemHandlers[number])),reportQueueCopied,bodySettingsCopied,settingsOwnersReadable,pendingReportCount:JSON.parse(queueBefore).rows.length,reportPlayers:players.length,c4Count:c4,c4CountValid:Number.isSafeInteger(c4)&&c4>=0,bodyStatus,uiStates,aliasesQueried:ALIASES.length,uniqueAliases:new Set(ALIASES.map(a=>a.name)).size,invalidAliases,canonicalFilesExpected:6,lowKarmaCommandBlank:Server.getCvar('sm_ttt_karma_low_command')==='',itemsNativeEffectObserved:false,clientRenderingObserved:false});
    }catch {emit({event:'ten-owner-readiness-error'});}
  });
  command('ttt_public_check', inv => {
    if (!admitted(inv, 0)) return;
    const startEpoch = epoch, map = Server.mapName;
    try {
      const game = core.getGame(), slots = core.activeSlots().slice(0, 64), handlers = karma.getHandlers();
      const expected = ['karma.damage','karma.death','karma.gameState','karma.roleAssigning','karma.karma','karma.join','karma.leave'];
      const registry = slots.map(slot => ({ slot, role: core.roleOf(slot), participating: core.isParticipating(slot), steamId: core.steamIdOf(slot).slice(0, 32), karma: karma.karmaOf(slot), timeout: karma.timeoutRemaining(slot) }));
      const domains = { damage: core.hasDomain('damage'), karma: core.hasDomain('karma'), gameState: core.hasDomain('gameState') };
      if (startEpoch !== epoch || map !== Server.mapName || !safeStage()) return;
      emit({ event: 'check', game, registry, domains, handlers, exactKarmaHandlers: handlers.length === expected.length && expected.every(h => handlers.includes(h as typeof handlers[number])), heAvailable: he.available, heReason: he.status.reason?.slice(0, 200) ?? null });
    } catch (error) { emit({ event: 'check-error', message: String(error).slice(0, 200) }); }
  });
  command('ttt_public_watch', inv => {
    if (!admitted(inv, 1)) return;
    const t = target(inv); if (!t) { inv.reply('public-probe refused: current living bot required'); return; }
    stopWatch();
    const state = { target: t, count: 0, deadline: Server.gameTime + 60, callback: (_info: DamageInfo): void => {} };
    state.callback = info => {
      if (watch !== state || state.count >= 16 || !current(t) || !safeStage()) return;
      const victim = info.victim;
      if (!same(victim, t.pawn)) return;
      const observation = { event: 'damage', slot: t.slot, damage: info.damage, damageType: info.damageType,
        victim: copyRef(victim), attacker: copyRef(info.attacker), inflictor: copyRef(info.inflictor) };
      if (!Number.isFinite(observation.damage) || !Number.isFinite(observation.damageType) || watch !== state || !current(t) || !safeStage()) return;
      state.count++; emit(observation);
    };
    watch = state;
    try {
      const registered = SDKHook(t.pawn, 'OnTakeDamage', state.callback);
      if (!registered || !current(t) || !safeStage()) { stopWatch(); emit({ event: 'watch', registered: false }); return; }
      emit({ event: 'watch', registered: true, slot: t.slot, pawn: copyRef(t.pawn), maxObservations: 16, seconds: 60 });
    } catch (error) { stopWatch(); emit({ event: 'watch-error', message: String(error).slice(0, 160) }); }
  });
  command('ttt_public_he', inv => {
    if (!admitted(inv, 1)) return;
    if (ring) { inv.reply('public-probe refused: ring already active'); return; }
    if (!he.available) { emit({ event: 'he-unavailable', reason: he.status.reason?.slice(0, 200) }); return; }
    const t = target(inv), pawn = t ? Player.fromSlot(t.slot)?.pawn : null, origin = pawn?.origin;
    if (!t || !origin || ![origin.x, origin.y, origin.z].every(Number.isFinite) || !current(t) || !safeStage()) { inv.reply('public-probe refused: current living bot origin required'); return; }
    const state: Ring = { target: t, refs: [], deadline: Server.gameTime + 5 };
    ring = state; // Frame-driven cleanup requires no asynchronous queue admission.
    try {
      for (let i = 0; i < 3; i++) {
        if (ring !== state || !current(t) || !safeStage()) break;
        const team = Player.fromSlot(t.slot)?.teamNum;
        if (team == null || !current(t)) break;
        const angle = i * Math.PI * 2 / 3;
        const ref = he.call({ x: origin.x, y: origin.y, z: origin.z + 16 }, { x: 0, y: 0, z: 0 },
          { x: Math.cos(angle) * 60, y: Math.sin(angle) * 60, z: 30 }, { x: 0, y: 0, z: 0 }, t.pawn, 44, team);
        if (ref) state.refs.push(ref);
        if (ring !== state) { if (ref?.isValid()) ref.acceptInput('Kill'); break; }
      }
      if (!current(t) || !safeStage()) { cleanup('target-or-staging-changed'); return; }
      emit({ event: 'he-created', slot: t.slot, returned: state.refs.length, valid: state.refs.filter(r => r.isValid()).length, refs: state.refs.map(copyRef), cleanupAfterSeconds: 5 });
    } catch (error) { cleanup('factory-error'); emit({ event: 'he-error', message: String(error).slice(0, 200) }); }
  });
  command('ttt_public_cleanup', inv => { if (admitted(inv, 0)) { cleanup('operator'); stopWatch(); } });
}
export function OnGameFrame(): void {
  weaponProbe?.preFrame();
  if (ring && (Server.gameTime >= ring.deadline || !safeStage() || !current(ring.target))) cleanup('deadline-or-guard');
  if (watch && (Server.gameTime >= watch.deadline || !safeStage() || !current(watch.target))) stopWatch();
}
export function OnMapStart(): void { weaponProbe?.stop('map-start'); active = true; epoch++; }
export function OnMapEnd(): void { botMotion?.stop('map-end'); grantObserver?.stop(); weaponProbe?.stop('map-end'); active = false; epoch++; cleanup('map-end'); stopWatch(); }
export function OnPluginEnd(): void { botMotion?.close(); grantObserver?.close(); weaponProbe?.close(); active = false; epoch++; cleanup('unload'); stopWatch(); }
