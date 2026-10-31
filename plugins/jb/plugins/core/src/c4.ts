import {logEntry} from '@edgegamers/jailbreak-shared';
/**
 * The jihad C4 (Jailbreak.Rebel C4Behavior). A random prisoner gets a C4 each round; holding it
 * out and pressing E arms it: the bomber becomes a rebel, shouts, and `c4_delay` seconds later
 * explodes — guards within `c4_radius` take falloff damage (lethal hits are credited to the bomber
 * in the kill feed with the OnBombIcon icon) and the bomber dies.
 *
 * Only C4s core itself hands out are jihad bombs (the random round-start bomb and `giveBomb`, e.g.
 * RTD's Bomb reward), tracked by entity ref as C4Behavior tracked its `bombs` dictionary. Any other
 * `weapon_c4` (RTD's Fake Bomb, a map's bomb) is a plain C4. Like the C#, tracking is cleared at
 * round start. After a detonation's damage is applied `OnBombDetonated` reports the kills.
 */
import { after, config, createEntity, HookResult } from "@s2script/sdk";
import type { EntityRef, HookResultValue, PrecacheContext } from "@s2script/sdk";
import { Clients } from "@s2script/sdk";
import { Player, Weapon } from "@s2script/cs2";
import type { GameEvents } from "@s2script/cs2";
import { Team, alivePlayers, isAlive } from "@edgegamers/jailbreak-shared";
import { applyC4Damage, c4Damage, pressedNow, randomBombDecision, resolveBombIcon, DEFAULT_BOMB_ICON } from "./c4-logic";
import { distanceSquared } from "./cell-logic";
import { bus, refOf } from "./bus";
import { currentRound } from "./round";
import { markRebel } from "./rebels";
import { describe, log } from "./logs";
import { msgFor } from "./messages";

const SOUND_ARM = "jb.jihad";
const SOUND_EXPLODE = "jb.jihadExplosion";
const PARTICLE = "particles/explosions_fx/explosion_c4_500.vpcf";

/** The jihad C4s core handed out, by entity index (C4Behavior.bombs). */
const bombs = new Map<number, EntityRef>();
/** C4Behavior.giveNextRound inverted: the RTD Bomb reward suppresses the next random bomb. */
let skipRandomNextRound = false;
/** Bomb indexes currently counting down. */
const detonating = new Set<number>();
/** Last frame's button mask per bomb index (rising-edge detection of E). */
const lastButtons = new Map<number, number>();
/** Victim slot → who blew them up and with which icon (rewritten into player_death). */
const deathToKiller = new Map<number, { killerSlot: number; icon: string }>();

export function precacheC4(pc: PrecacheContext): void {
  pc.add(PARTICLE);
  pc.add("soundevents/jb/soundevents_jihad.vsndevts");
  pc.add("sounds/jb/jihad/explosion.vsnd");
  pc.add("sounds/jb/jihad/jihad.vsnd");
}

function trackBomb(ref: EntityRef): void {
  bombs.set(ref.index, ref);
}

/** Forget a bomb. Only the exact tracked entity (same host id) is forgotten, never a later C4 reusing the index. */
export function untrackBomb(ref: EntityRef | null): void {
  if (!ref) return;
  const tracked = bombs.get(ref.index);
  if (tracked && tracked.id !== ref.id && tracked.isValid()) return;
  bombs.delete(ref.index);
  detonating.delete(ref.index);
  lastButtons.delete(ref.index);
}

/**
 * Round start (C4Behavior.OnRoundStart): forget every jihad C4 and kill-feed rewrite
 * (ClearActiveC4s), then hand a C4 to a random prisoner 1s later unless the RTD Bomb reward
 * asked to skip this round.
 */
export function resetC4(): void {
  bombs.clear();
  detonating.clear();
  deathToKiller.clear();
  lastButtons.clear();
  const d = randomBombDecision(config.getBool("c4_give"), skipRandomNextRound);
  skipRandomNextRound = d.skipNext;
  if (d.give) after(1000, giveToRandomPrisoner);
}

/** Contract `skipRandomBombNextRound` (C4Behavior.DontGiveC4NextRound). */
export function skipRandomBombNextRound(): void {
  skipRandomNextRound = true;
}

/** Contract `giveBomb`: a living prisoner gets a jihad C4 now (C4Behavior.TryGiveC4ToPlayer). */
export function giveBomb(slot: number): boolean {
  const p = Player.fromSlot(slot);
  if (!p || !isAlive(p) || p.teamNum !== Team.Prisoner) return false;
  return giveC4(p);
}

export function giveC4(p: Player): boolean {
  const pawn = p.pawn;
  if (!pawn || !pawn.isValid) return false;
  const w = pawn.giveNamedItem("weapon_c4");
  if (!w) return false;
  trackBomb(w.ref);
  const c = Clients.fromSlot(p.slot);
  c?.chat(msgFor(c?.slot).c4Received());
  c?.chat(msgFor(c?.slot).c4Usage());
  log(...logEntry("JB_LOG_RECEIVED_A_JIHAD_C", [String(describe(p.slot))]));
  return true;
}

function giveToRandomPrisoner(): void {
  const candidates = alivePlayers(Team.Prisoner).filter((p) => !Clients.fromSlot(p.slot)?.isBot);
  if (candidates.length === 0) return;
  giveC4(candidates[Math.floor(Math.random() * candidates.length)]);
}

/** Per frame: a bomb held out by its carrier whose E went down starts a detonation. */
export function pollC4(): void {
  if (bombs.size === 0) return;
  for (const [index, ref] of bombs) {
    if (!ref.isValid()) {
      untrackBomb(ref);
      continue;
    }
    if (detonating.has(index)) continue;
    const owner = Weapon.fromEntity(ref)?.owner;
    const active = owner?.activeWeapon;
    if (!owner || !active || active.ref.index !== index) {
      lastButtons.delete(index);
      continue;
    }
    const buttons = owner.buttons;
    const before = lastButtons.get(index) ?? buttons; // first sight is not an edge
    lastButtons.set(index, buttons);
    if (!pressedNow(buttons, before)) continue;
    const carrier = owner.controller;
    if (carrier) startDetonation(carrier, index);
  }
}

function startDetonation(bomber: Player, index: number): void {
  detonating.add(index);
  markRebel(bomber.slot, 0, "c4");
  bomber.pawn?.emitSound(SOUND_ARM);
  log(...logEntry("JB_LOG_ARMED_A_JIHAD_C", [String(describe(bomber.slot))]));

  // The kill-feed icon is decided once per detonation (gang perks patch it).
  let icon = DEFAULT_BOMB_ICON;
  const h = bus();
  if (h) icon = resolveBombIcon(h.dispatch("OnBombIcon", { player: refOf(bomber), icon }).payload.icon);

  const userId = bomber.userId;
  const round = currentRound();
  const delayMs = Math.max(0, config.getFloat("c4_delay")) * 1000;
  after(delayMs, () => detonate(userId, index, round, icon));
}

function detonate(userId: number, index: number, round: number, icon: string): void {
  const bomb = bombs.get(index);
  const bomber = Player.fromUserId(userId);
  if (round !== currentRound()) return; // armed last round; round start already cleared it
  if (!bomber || !isAlive(bomber)) {
    if (bomb?.isValid()) Weapon.fromEntity(bomb)?.remove();
    untrackBomb(bomb ?? null);
    return;
  }
  const origin = bomber.pawn?.origin;
  if (!origin) return;

  const radius = config.getFloat("c4_radius");
  const base = config.getFloat("c4_damage");
  let killed = 0;
  for (const ct of alivePlayers(Team.Guard)) {
    const pawn = ct.pawn;
    const at = pawn?.origin;
    if (!pawn || !at) continue;
    const distance = Math.sqrt(distanceSquared(at, origin));
    const damage = c4Damage(distance, radius, base);
    if (damage <= 0) continue;
    const result = applyC4Damage(pawn.health ?? 0, damage);
    if (result.killed) {
      deathToKiller.set(ct.slot, { killerSlot: bomber.slot, icon });
      pawn.slay();
      killed++;
    } else {
      pawn.health = result.health;
    }
  }

  bomber.pawn?.emitSound(SOUND_EXPLODE);
  spawnExplosion(origin);
  log(...logEntry("JB_LOG_DETONATED_A_JIHAD_C_KILLING_GUARD", [String(describe(bomber.slot)), String(killed), String(killed === 1 ? "" : "s")], [2]));
  const bomberRef = refOf(bomber);
  // Dying drops the C4; bomb_dropped (below) removes it while it is still marked detonating.
  bomber.pawn?.slay();
  // Only guards are damaged, so every kill is a guard kill (the bomber is not counted).
  bus()?.emit("OnBombDetonated", { player: bomberRef, killed, killedGuards: killed });
  // If the drop event did not get it (or the bomber held it oddly), remove it a moment later.
  after(250, () => {
    if (bomb?.isValid()) Weapon.fromEntity(bomb)?.remove();
    untrackBomb(bomb ?? null);
  });
}

function spawnExplosion(at: { x: number; y: number; z: number }): void {
  const fx = createEntity("info_particle_system", {
    effect_name: PARTICLE,
    start_active: true,
    origin: `${at.x} ${at.y} ${at.z}`,
  });
  // C4Behavior never removed it; we clean up once the effect has played.
  if (fx) after(5000, () => fx.remove());
}

/** bomb_dropped (pre): an armed bomb that falls from its (dead) carrier is removed. */
export function onBombDropped(ev: GameEvents["bomb_dropped"]): HookResultValue {
  const index = Number.parseInt(ev.getUint64("entindex"), 10);
  if (!detonating.has(index)) return HookResult.Continue;
  const ref = bombs.get(index);
  if (ref?.isValid()) ref.remove();
  return HookResult.Stop;
}

/** player_death (pre): credit C4 kills to the bomber with the kill-feed icon. */
export function onPlayerDeathPre(ev: GameEvents["player_death"]): HookResultValue {
  const victim = ev.getPlayerSlot("userid");
  const entry = deathToKiller.get(victim);
  if (!entry) return HookResult.Continue;
  deathToKiller.delete(victim);
  if (!Player.fromSlot(entry.killerSlot)) return HookResult.Continue;
  ev.setInt("attacker", entry.killerSlot);
  ev.setString("weapon", entry.icon);
  return HookResult.Changed;
}

export function onDisconnectC4(slot: number): void {
  deathToKiller.delete(slot);
}
