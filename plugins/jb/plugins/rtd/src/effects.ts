import { decluttrCall } from '../../../../decluttr/src/owner.ts';
/**
 * Round-long reward effects: "Cannot Use …" pickup blocks, the per-frame knife/scope blocks
 * (C# AbstractOnTickReward) and chat spies. Everything is keyed by userId and cleared at round end,
 * exactly like the C# (which cleared on round_end).
 */
import { Clients, Commands, HookResult, Server } from "@s2script/sdk";
import type { HookResultValue } from "@s2script/sdk";
import { Player, RenderMode_t } from "@s2script/cs2";
import type { AcquireMethod, AcquireResult } from "@s2script/cs2";
import type { CanAcquireView, Weapon } from "@s2script/cs2";
import { Colors, setPawnColor, Team } from "@edgegamers/jailbreak-shared";
import type { Rgb } from "@edgegamers/jailbreak-shared";
import { WEAPON_GROUPS, SNIPERS, classForDefIndex, isKnife } from "./weapons.ts";
import type { WeaponGroup } from "./weapons.ts";
import { msg } from "./messages.ts";

/**
 * CanAcquire enum values. `@s2script/cs2` declares AcquireMethod/AcquireResult as enums in its types
 * but does not export them at runtime, so reading `AcquireMethod.PickUp` from it throws on every
 * acquire. Values match the engine enums (same as TTT's `cs2/acquire.ts`).
 */
const ACQUIRE_PICKUP = 0 as AcquireMethod;
const ACQUIRE_PROHIBITED = 7 as AcquireResult;

export type TickBlock = "scope" | "leftKnife" | "rightKnife";

/** userId → weapon groups that player may not pick up this round. */
const blockedGroups = new Map<number, Set<WeaponGroup>>();
/** Per-frame attack blocks. */
const tickBlocks: Record<TickBlock, Set<number>> = {
  scope: new Set(),
  leftKnife: new Set(),
  rightKnife: new Set(),
};
/** userIds that read the other team's team chat. */
const spies = new Set<number>();
/** Only the pawn actually tinted by an RTD reward is restored. */
const tinted = new Map<number, { pawnId: number; transparent: boolean }>();

export function tintPlayer(player: Player, color: Rgb, alpha: number): boolean {
  const pawn = player.pawn;
  if (!pawn || !pawn.isValid) return false;
  const currentAlpha = ((pawn.render ?? 0xffffffff) >>> 24) & 0xff;
  const previous = tinted.get(player.userId);
  if (!previous || previous.pawnId !== pawn.ref.id) {
    tinted.set(player.userId, { pawnId: pawn.ref.id, transparent: alpha < 255 });
  } else if (alpha < 255) {
    previous.transparent = true;
  }
  return setPawnColor(pawn, color, alpha === 255 ? currentAlpha : alpha);
}

export function blockGroup(userId: number, group: WeaponGroup): void {
  let groups = blockedGroups.get(userId);
  if (!groups) {
    groups = new Set();
    blockedGroups.set(userId, groups);
  }
  groups.add(group);
}

export function addTickBlock(kind: TickBlock, userId: number): void {
  tickBlocks[kind].add(userId);
}

export function addSpy(userId: number): void {
  spies.add(userId);
}

/** Round end: every round-long effect expires. */
export function clearRound(): void {
  for (const [userId, before] of tinted) {
    const pawn = Player.fromUserId(userId)?.pawn;
    if (!pawn || !pawn.isValid || pawn.ref.id !== before.pawnId) continue;
    const alpha = before.transparent ? 255 : ((pawn.render ?? 0xffffffff) >>> 24) & 0xff;
    setPawnColor(pawn, Colors.White, alpha);
    if (before.transparent) pawn.renderMode = RenderMode_t.RenderNormal;
  }
  tinted.clear();
  blockedGroups.clear();
  for (const s of Object.values(tickBlocks)) s.clear();
  spies.clear();
}

export function forgetUser(userId: number): void {
  tinted.delete(userId);
  blockedGroups.delete(userId);
  for (const s of Object.values(tickBlocks)) s.delete(userId);
  spies.delete(userId);
}

function weaponClass(w: Weapon | null): string | null {
  if (!w || !w.isValid()) return null;
  return classForDefIndex(w.attributeManager.item.itemDefinitionIndex);
}

/** items.onCanAcquire: refuse pickups of a blocked group (C# only blocked AcquireMethod.PickUp). */
export function onCanAcquire(view: CanAcquireView): HookResultValue | void {
  if (blockedGroups.size === 0) return;
  if (view.method !== ACQUIRE_PICKUP) return;
  const player = view.player;
  if (!player) return;
  const groups = blockedGroups.get(player.userId);
  if (!groups) return;
  const cls = classForDefIndex(view.defIndex);
  if (cls === null) return;
  for (const g of groups) {
    if (WEAPON_GROUPS[g].items.has(cls)) {
      view.result = ACQUIRE_PROHIBITED;
      return HookResult.Changed;
    }
  }
}

/** Per frame: push the blocked attack's next-allowed tick 500 ticks ahead (C# `TickCount + 500`). */
export function onFrame(): void {
  if (tickBlocks.scope.size + tickBlocks.leftKnife.size + tickBlocks.rightKnife.size === 0) return;
  // GameTick_t at CS2's fixed 64 tick; only needs to be "comfortably in the future".
  const until = Math.floor(Server.gameTime * 64) + 500;
  for (const kind of ["scope", "leftKnife", "rightKnife"] as const) {
    for (const userId of tickBlocks[kind]) {
      const weapon = Player.fromUserId(userId)?.pawn?.activeWeapon ?? null;
      const cls = weaponClass(weapon);
      if (!weapon || cls === null) continue;
      if (kind === "scope") {
        if (SNIPERS.has(cls)) weapon.nextSecondaryAttackTick = until;
      } else if (isKnife(cls)) {
        if (kind === "leftKnife") weapon.nextPrimaryAttackTick = until;
        else weapon.nextSecondaryAttackTick = until;
      }
    }
  }
}

function teamLabel(teamNum: number | null): string {
  if (teamNum === Team.Prisoner) return "T";
  if (teamNum === Team.Guard) return "CT";
  return "Spec";
}

/** clients.onSay: copy team chat to spies on another team. Never suppresses the original line. */
export function onSay(slot: number, text: string, teamonly: boolean): void {
  if (!teamonly || spies.size === 0) return;
  if (Commands.parseChatTrigger(text) !== null) return;
  if (!decluttrCall(true, provider => provider.checkChat(slot, text))) return;
  const sender = Player.fromSlot(slot);
  if (!sender) return;
  const line = msg.spy(teamLabel(sender.teamNum), sender.playerName ?? "", text);
  for (const userId of spies) {
    const spy = Player.fromUserId(userId);
    if (!spy || spy.slot === slot || spy.teamNum === sender.teamNum) continue;
    Clients.fromSlot(spy.slot)?.chat(line);
  }
}
