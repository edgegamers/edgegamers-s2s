import { Player, PlayerConnectedState } from '@s2script/cs2';
import { Clients } from '@s2script/sdk/clients';
import { command } from '@s2script/sdk/commands';
import { Events, HookResult, type GameEvent, type HookResultValue } from '@s2script/sdk/events';
import { createScope, type Scope } from '@s2script/sdk/plugin';
import { SDKHook, SDKUnhook } from '@s2script/sdk/sdkhooks';
import { Server } from '@s2script/sdk/server';
import { Sound } from '@s2script/sdk/sound';
import { UserMessages, type UserMessageView } from '@s2script/sdk/usermessages';
import type { DamageInfo } from '@s2script/sdk/damage';
import type { EntityRef } from '@s2script/sdk/entity';
import type { DecluttrConfig } from './config.ts';

// Native names, Valve tokens and sound IDs checked against oqyh/cs2-Game-Manager-GoldKingZ
// (Config/Helper.cs, Game_UserMessages.cs, Resources/SoundEvents_{Hash,Names}.txt).
// This is an independent implementation; no upstream C# is incorporated.
const RADIO_COMMANDS = 'coverme takepoint holdpos regroup followme takingfire go fallback sticktog getinpos stormfront report roger enemyspot needbackup sectorclear inposition reportingin getout negative enemydown sorry cheer compliment thanks go_a go_b needrop deathcry'.split(' ');
const TEAM_WARNINGS = new Set([
  '#Cstrike_TitlesTXT_Game_teammate_attack', '#Cstrike_TitlesTXT_Game_teammate_kills',
  '#Cstrike_TitlesTXT_Hint_careful_around_teammates', '#Cstrike_TitlesTXT_Hint_try_not_to_injure_teammates',
  '#Cstrike_TitlesTXT_Killed_Teammate', '#SFUI_Notice_Game_teammate_kills',
  '#SFUI_Notice_Hint_careful_around_teammates', '#SFUI_Notice_Killed_Teammate',
]);
const DEFAULT_KNIFE_EVENTS = ['3756387178', '2294996470', '3439870439', '3393546924', '2486534908',
  'Weapon_Knife.Hit', 'Weapon_Knife.Stab', 'KnifePush.Hit'];
const SOUND_MESSAGES = ['CMsgSosStartSoundEvent', 'CCSUsrMsg_WeaponSound'] as const;
const MESSAGE_NAMES = ['CUserMessageTextMsg', 'CCSUsrMsg_RadioText', 'CCSUsrMsg_HintText',
  'CUserMessageSayText', 'CMsgTEFireBullets', ...SOUND_MESSAGES];

interface Assignment { original: string; applied: string }
interface MusicAssignment { player: Player; original: number; applied: number }
interface KnifeHit { attacker: Player; victim: Player; attackerPawn: EntityRef; victimPawn: EntityRef; tick: number; friendly: boolean }
const same = (a: EntityRef | null | undefined, b: EntityRef | null | undefined) =>
  a != null && b != null && a.index === b.index && a.id === b.id;
const matchesSound = (value: string, filters: string[]) => filters.some(filter => filter.length > 0 && value.toLowerCase().includes(filter.toLowerCase()));

export function createEffects(getConfig: () => DecluttrConfig, ownsKillfeed: () => boolean) {
  const cvars = new Map<string, Assignment>(), music = new Map<number, MusicAssignment>();
  const knives = new Map<number, KnifeHit>(), damagePawns = new Map<number, EntityRef>();
  let scope: Scope | undefined, registered = false, disposed = false;

  function releaseCvar(name: string, assignment: Assignment) {
    if (Server.getCvar(name) === assignment.applied) Server.setCvar(name, assignment.original);
    cvars.delete(name);
  }
  function restoreMusic() {
    for (const { player, original, applied } of music.values()) {
      if (player.ref.isValid() && player.musicKitID === applied) player.musicKitID = original;
    }
    music.clear();
  }
  function muteMusicKit(player: Player) {
    if (!player.ref.isValid() || player.musicKitID == null) return;
    const previous = music.get(player.ref.id);
    if (previous && player.musicKitID === previous.applied) return;
    const original = player.musicKitID;
    if (original === 0) return;
    player.musicKitID = 0;
    if (player.musicKitID === 0) music.set(player.ref.id, { player, original, applied: 0 });
  }
  function apply() {
    if (disposed) return;
    const c = getConfig(), desired = new Map<string, string>();
    if (c.radio.bots) desired.set('bot_chatter', 'off');
    if (c.radio.grenades) desired.set('sv_ignoregrenaderadio', '1');
    if (c.hud.radar) desired.set('sv_disable_radar', '1');
    if (c.sounds.footsteps) desired.set('sv_footsteps', '0');
    if (c.sounds.landing) desired.set('sv_min_jump_landing_sound', '999999');
    const tags = c.hud.teamTags;
    if (tags.mode === 'all') desired.set('sv_teamid_overhead', '0');
    if (tags.mode === 'walls' || tags.mode === 'distance') {
      desired.set('sv_teamid_overhead', '1');
      desired.set('sv_teamid_overhead_always_prohibit', '1');
      desired.set('sv_teamid_overhead_maxdist', tags.mode === 'distance' ? String(tags.distance) : '0');
    }
    for (const [name, assignment] of cvars) if (!desired.has(name)) releaseCvar(name, assignment);
    for (const [name, value] of desired) {
      const current = Server.getCvar(name), previous = cvars.get(name);
      // A new owner edit becomes the baseline if this reload explicitly takes ownership again.
      const original = previous && current === previous.applied ? previous.original : current;
      if (!current || current.startsWith('<')) { cvars.delete(name); continue; }
      if (Server.setCvar(name, value)) cvars.set(name, { original, applied: Server.getCvar(name) });
    }
    if (c.sounds.music === 'off') restoreMusic();
    if (c.sounds.knife !== 'team') knives.clear();
    for (const player of Player.allConnected()) attachDamage(player.pawn?.ref ?? null);
  }
  function filterKillfeed(attackerSlot: number, recipients: number[]): number[] {
    if (disposed) return [...recipients];
    const mode = getConfig().hud.killfeed;
    return recipients.filter(slot => mode === 'off' || mode === 'self' && attackerSlot >= 0 && slot === attackerSlot);
  }
  function onDeath(event: GameEvent): HookResultValue | void {
    if (ownsKillfeed()) return;
    const c = getConfig(), victim = Player.fromSlot(event.getPlayerSlot('userid'));
    const attacker = event.getPlayerSlot('attacker');
    if (c.messages.disconnect === 'all' && victim?.connected === PlayerConnectedState.Disconnecting
      && (attacker < 0 || attacker === victim.slot)) return HookResult.Handled;
    if (c.hud.killfeed === 'off') return;
    Events.setRecipients(filterKillfeed(attacker, Clients.all().filter(c => c.isValid() && !c.isBot).map(c => c.slot)));
    return HookResult.Handled;
  }
  function textMessage(message: UserMessageView): HookResultValue | void {
    const c = getConfig().messages;
    const blocked = (message.readStrings('param') ?? []).some(text =>
      c.custom.enabled && c.custom.text.includes(text)
      || c.teamAttack && TEAM_WARNINGS.has(text)
      || c.money && (/^#(?:Player_Cash_Award_|Player_Point_Award_|Player_Team_Award_|Team_Cash_Award_)/.test(text)
        || /^#Notice_Bonus_(?:Enemy_Team|Shorthanded_Eligibility(?:_Single)?)$/.test(text))
      || c.saved && /^#Chat_SavePlayer_(?:Savior|Spectator|Saved)$/.test(text)
      || c.chicken && text.includes('#Pet_Killed'));
    if (blocked) return HookResult.Handled;
  }
  function radioMessage(message: UserMessageView): HookResultValue | void {
    const c = getConfig().messages;
    if ((message.readStrings('params') ?? []).some(text =>
      c.custom.enabled && c.custom.radio.includes(text)
      || c.planting && text.includes('#Cstrike_TitlesTXT_Planting_Bomb')
      || c.defusing && text.includes('#Cstrike_TitlesTXT_Defusing_Bomb'))) return HookResult.Handled;
  }
  function hintMessage(message: UserMessageView): HookResultValue | void {
    const c = getConfig().messages, text = message.readString('message') ?? '';
    if (c.teamAttack && TEAM_WARNINGS.has(text) || c.custom.enabled && c.custom.hint.includes(text)) return HookResult.Handled;
  }
  function mapMessage(message: UserMessageView): HookResultValue | void {
    const c = getConfig().messages.map;
    if (!c.enabled || message.readInt('playerindex') !== -1) return;
    if (c.mode === 'all') return HookResult.Handled;
    const map = Server.mapName.toLowerCase();
    const rule = c.rules.find(r => r.map.toLowerCase() === map)
      ?? c.rules.filter(r => r.map.endsWith('_') && map.startsWith(r.map.toLowerCase())).sort((a, b) => b.map.length - a.map.length)[0]
      ?? c.rules.find(r => r.map.toUpperCase() === 'ANY');
    const text = (message.readString('text') ?? '').toLowerCase();
    if (rule?.words.some(word => word.trim().length > 0 && text.includes(word.toLowerCase()))) return HookResult.Handled;
  }
  function gunshots(message: UserMessageView): HookResultValue | void {
    const c = getConfig().sounds;
    if (c.gunshots === 'off') return;
    if (c.gunshots === 'mute') { message.setInt('sound_type', 0); return HookResult.Changed; }
    const replacement = c.gunshots === 'custom' ? c.replacement
      : { weaponId: 0, soundType: 9, itemDefIndex: c.gunshots === 'm4' ? 60 : 61 };
    message.setInt('weapon_id', replacement.weaponId);
    message.setInt('sound_type', replacement.soundType);
    message.setInt('item_def_index', replacement.itemDefIndex);
    return HookResult.Changed;
  }
  function onDamage(info: DamageInfo) {
    if (disposed || getConfig().sounds.knife !== 'team') return;
    const players = Player.allConnected();
    const attacker = players.find(p => same(p.pawn?.ref, info.attacker) || same(p.ref, info.attacker));
    const victim = players.find(p => same(p.pawn?.ref, info.victim));
    if (!attacker?.pawn || !victim?.pawn) return;
    // Replace prior attribution even for enemy/non-knife hits in the same simulation tick.
    knives.delete(attacker.pawn.ref.index); knives.delete(victim.pawn.ref.index);
    if (!(info.damageType & 4) || info.damage <= 0) return; // DMG_SLASH
    const friendly = attacker.slot !== victim.slot && (attacker.teamNum ?? 0) >= 2 && attacker.teamNum === victim.teamNum;
    const hit = { attacker, victim, attackerPawn: attacker.pawn.ref, victimPawn: victim.pawn.ref, tick: Server.tickCount, friendly };
    knives.set(hit.attackerPawn.index, hit); knives.set(hit.victimPawn.index, hit);
  }
  function attachDamage(pawn: EntityRef | null) {
    if (disposed || !pawn?.isValid() || damagePawns.has(pawn.id)) return;
    if (SDKHook(pawn, 'OnTakeDamage', onDamage)) damagePawns.set(pawn.id, pawn);
  }
  function soundMessage(message: UserMessageView): HookResultValue | void {
    const c = getConfig().sounds, hashed = message.name === 'CMsgSosStartSoundEvent';
    const hash = hashed ? message.readInt('soundevent_hash') : null;
    const sound = hashed ? hash == null ? '' : String(hash >>> 0) : message.readString('sound') ?? '';
    if (!sound) return;
    if (c.custom.enabled && matchesSound(sound, c.custom.events)) return HookResult.Handled;
    if (c.knife === 'off' || !matchesSound(sound, c.knifeEvents.length ? c.knifeEvents : DEFAULT_KNIFE_EVENTS)) return;
    if (c.knife === 'all') return HookResult.Handled;
    // Wall hits are never evidence of friendly damage, even after a stab in the same tick.
    if (sound === '2486534908' || sound.toLowerCase().includes('hitwall')) return;
    const source = message.readInt(hashed ? 'source_entity_index' : 'entidx');
    const hit = source == null ? undefined : knives.get(source);
    if (!hit || hit.tick !== Server.tickCount || !hit.friendly || Number(Server.getCvar('mp_teammates_are_enemies')) !== 0) return;
    if (hit.attacker.ref.isValid() && hit.victim.ref.isValid() && hit.attackerPawn.isValid() && hit.victimPawn.isValid()
      && same(hit.attacker.pawn?.ref, hit.attackerPawn) && same(hit.victim.pawn?.ref, hit.victimPawn)
      && hit.attacker.teamNum === hit.victim.teamNum) return HookResult.Handled;
  }
  function register() {
    if (registered || disposed) return;
    registered = true; scope = createScope();
    const pre = (name: string, handler: (e: GameEvent) => HookResultValue | void) =>
      scope!.events.onPre(name, e => { if (!disposed) return handler(e); });
    const message = (name: string, handler: (m: UserMessageView) => HookResultValue | void) =>
      UserMessages.onPre(name, m => { if (!disposed) return handler(m); });
    for (const name of RADIO_COMMANDS) command.onClientCommand(name, slot => {
      const client = Clients.fromSlot(slot), c = getConfig().radio;
      if (!disposed && client?.isValid() && (client.isBot ? c.bots : c.players)) return HookResult.Handled;
    });
    command.onClientCommand('playerchatwheel', slot => {
      if (!disposed && Clients.fromSlot(slot)?.isValid() && getConfig().radio.wheel) return HookResult.Handled;
    });
    command.onClientCommand('player_ping', slot => {
      if (!disposed && Clients.fromSlot(slot)?.isValid() && getConfig().radio.pings === 'all') return HookResult.Handled;
    });
    pre('player_ping', () => { if (getConfig().radio.pings === 'sound') return HookResult.Handled; });
    pre('player_team', () => { if (getConfig().messages.teamJoin) return HookResult.Handled; });
    pre('player_disconnect', () => { if (getConfig().messages.disconnect !== 'off') return HookResult.Handled; });
    pre('bomb_planted', () => { if (getConfig().messages.bombPlanted) return HookResult.Handled; });
    pre('player_death', onDeath);
    pre('round_mvp', event => {
      const mode = getConfig().sounds.music;
      if (mode === 'off') return;
      event.setInt('nomusic', 1);
      const player = Player.fromSlot(event.getPlayerSlot('userid'));
      if (player) muteMusicKit(player);
      if (mode === 'all') Sound.emit('StopSoundEvents.StopAllMusic');
      return HookResult.Changed;
    });
    pre('round_end', event => {
      if (getConfig().sounds.music !== 'all') return;
      event.setInt('nomusic', 1); Sound.emit('StopSoundEvents.StopAllMusic'); return HookResult.Changed;
    });
    scope.entities.onSpawn('player', entity => attachDamage(entity));
    scope.events.on('player_spawn', event => attachDamage(Player.fromSlot(event.getPlayerSlot('userid'))?.pawn?.ref ?? null));
    message('CUserMessageTextMsg', textMessage); message('CCSUsrMsg_RadioText', radioMessage);
    message('CCSUsrMsg_HintText', hintMessage); message('CUserMessageSayText', mapMessage);
    message('CMsgTEFireBullets', gunshots);
    for (const name of SOUND_MESSAGES) message(name, soundMessage);
    for (const player of Player.allConnected()) attachDamage(player.pawn?.ref ?? null);
  }
  function reset() {
    for (const [name, assignment] of cvars) releaseCvar(name, assignment);
    restoreMusic(); knives.clear();
    for (const pawn of damagePawns.values()) SDKUnhook(pawn, 'OnTakeDamage', onDamage);
    damagePawns.clear();
  }
  function dispose() {
    if (disposed) return;
    disposed = true; reset(); scope?.dispose();
    if (registered) for (const name of MESSAGE_NAMES) UserMessages.off(name);
  }
  return { register, apply, reset, dispose, filterKillfeed };
}
