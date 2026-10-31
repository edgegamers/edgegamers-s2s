import {logEntry} from '@edgegamers/jailbreak-shared';
import {nameFor,descriptionFor} from './rewards';
import {plainPhraseFor as labelFor,phraseFor} from '@edgegamers/jailbreak-shared';
/**
 * Rolling and rewarding (C# RTDCommand + RTDRewarder + RewardGenerator.GenerateReward +
 * RTDStatsCommand + Debug/DebugRTD).
 *
 * A roll stores one reward per player (by userId). It is granted ~2 ticks after that player's next
 * spawn outside warmup, then forgotten — so "one roll per player" means one pending reward at a time.
 * Alive players can only roll between round_end and the next round start (or in warmup); dead
 * players can roll any time.
 */
import { Admin, ADMFLAG, Clients, HookResult, after, config } from "@s2script/sdk";
import type { Command, HookResultValue } from "@s2script/sdk";
import { Menu, MenuStyle } from "@s2script/sdk/menu";
import { GameRules, Player } from "@s2script/cs2";
import { Team, isAlive } from "@edgegamers/jailbreak-shared";
import { describe, log } from "@edgegamers/jailbreak-core";
import { formatPercent, percentages, pickWeighted } from "./generator.ts";
import { REWARDS, enabledRewards } from "./rewards.ts";
import type { Reward } from "./rewards.ts";
import { rollDecision } from "./rules.ts";
import { msgFor } from "./messages.ts";

/** userId → the reward waiting for that player's next spawn. */
const pending = new Map<number, Reward>();
let betweenRounds = false;

export function isWarmup(): boolean {
  const rules = GameRules.get();
  return rules === null || rules.warmupPeriod === true;
}

export const minPlayers = (): number => config.getInt("rtd_minplayers");

export function hasReward(userId: number): boolean {
  return pending.has(userId);
}

export function setBetweenRounds(v: boolean): void {
  betweenRounds = v;
}

export function forgetUser(userId: number): void {
  pending.delete(userId);
}

/** C# RTDRewarder.SetReward: prepare, then store. */
function setReward(player: Player, reward: Reward): boolean {
  if (!reward.prepare(player)) return false;
  pending.set(player.userId, reward);
  return true;
}

/** C# GenerateReward(id): a weighted pick among the enabled rewards this player can receive. */
function generate(player: Player): Reward | null {
  const pool = enabledRewards().map((r) => ({ reward: r, weight: r.weight }));
  return pickWeighted(pool, (r) => r.canGrant(player), Math.random());
}

function tell(slot: number, line: string): void {
  Clients.fromSlot(slot)?.chat(line);
}

/**
 * Roll for `player`. `forced` is an index into the enabled list (root bypass), -1 for a random
 * roll that skips the checks, or null for a normal roll.
 */
export function roll(player: Player, forced: number | null): void {
  const slot = player.slot;
  const bypass = forced !== null;
  const old = pending.get(player.userId);
  const playerCount = Player.all().filter((p) => (p.teamNum ?? 0) > Team.Spectator).length;
  const decision = rollDecision({
    bypass,
    hasReward: old !== undefined,
    playerCount,
    minPlayers: minPlayers(),
    betweenRounds,
    warmup: isWarmup(),
    alive: isAlive(player),
  });
  if (decision === "already_rolled" && old) return tell(slot, msgFor(slot).alreadyRolled(nameFor(slot,old)));
  if (decision === "disabled") return tell(slot, msgFor(slot).rollingDisabled);
  if (decision === "not_yet") return tell(slot, msgFor(slot).cannotRollYet);

  let reward: Reward | null;
  if (forced !== null && forced >= 0) {
    reward = enabledRewards()[forced] ?? null;
  } else {
    reward = generate(player);
  }
  if (!reward) return tell(slot, msgFor(slot).rollingDisabled);

  if (!setReward(player, reward)) return tell(slot, msgFor(slot).rollFailed(nameFor(slot,reward)));
  tell(slot, msgFor(slot).rewardSelected(nameFor(slot,reward)));
  tell(slot, descriptionFor(slot,reward));
}

/** `!rtd` / `sm_rtd [index]` (the index is the root-only bypass from the C#). */
export function cmdRtd(cmd: Command): HookResultValue {
  const player = Player.fromSlot(cmd.callerSlot);
  if (cmd.callerSlot < 0 || !player) return HookResult.Handled;
  const bypass = cmd.argCount === 1 && (Admin.forSlot(cmd.callerSlot)?.hasFlags(ADMFLAG.ROOT) ?? false);
  if (!bypass) {
    roll(player, null);
    return HookResult.Handled;
  }
  const raw = cmd.arg(0);
  if (!/^-?\d+$/.test(raw)) {
    cmd.replyToChat(msgFor(cmd.callerSlot).invalidParameter(raw, labelFor(cmd.callerSlot,"JB_RTD_LABEL_INTEGER")));
    return HookResult.Handled;
  }
  const index = parseInt(raw, 10);
  const count = enabledRewards().length;
  if (index !== -1 && (index < 0 || index >= count)) {
    cmd.replyToChat(msgFor(cmd.callerSlot).invalidParameter(raw, `0-${count - 1}`));
    return HookResult.Handled;
  }
  roll(player, index);
  return HookResult.Handled;
}

/** `!rtdstats`: every enabled reward with its share of the die. */
export function cmdRtdStats(cmd: Command): HookResultValue {
  if (cmd.callerSlot < 0) return HookResult.Handled;
  const rewards = enabledRewards();
  const pct = percentages(rewards.map((r) => ({ reward: r, weight: r.weight })));
  rewards.forEach((r, i) => {
    const p = formatPercent(pct[i]);
    cmd.replyToChat(msgFor(cmd.callerSlot).statsLine(i, nameFor(cmd.callerSlot,r), p));
    cmd.replyToConsole(msgFor(cmd.callerSlot).statsConsole(i, nameFor(cmd.callerSlot,r), p));
  });
  return HookResult.Handled;
}

/** Root debug menu (C# `css_debug rtd`): pick any enabled reward as your next one. */
export function cmdDebugRtd(cmd: Command): HookResultValue {
  if (cmd.callerSlot < 0) return HookResult.Handled;
  const rewards = enabledRewards();
  const menu = new Menu(msgFor(cmd.callerSlot).debugMenuTitle);
  menu.style = MenuStyle.Center;
  for (const r of rewards) menu.addItem(String(r.poolIndex), msgFor(cmd.callerSlot).debugMenuItem(nameFor(cmd.callerSlot,r), r.weight));
  menu.onSelect((e) => {
    const reward = REWARDS[Number(e.info)];
    const p = Player.fromSlot(e.slot);
    if (!reward || !p) return;
    if (setReward(p, reward)) tell(e.slot, msgFor(e.slot).debugSet(nameFor(e.slot,reward)));
    else tell(e.slot, msgFor(e.slot).rollFailed(nameFor(e.slot,reward)));
  });
  menu.display(cmd.callerSlot, 0);
  return HookResult.Handled;
}

/** player_spawn: grant the pending reward ~2 ticks later (C# `RunOnTick(TickCount + 2)`). */
export function onSpawn(slot: number): void {
  if (isWarmup()) return;
  const player = Player.fromSlot(slot);
  if (!player) return;
  const userId = player.userId;
  const reward = pending.get(userId);
  if (!reward || !reward.canGrant(player)) return; // wrong team: keep it for a later spawn
  after(40, () => {
    const p = Player.fromUserId(userId);
    if (!p || pending.get(userId) !== reward) return;
    if (reward.spec.kind !== "nothing") log(...logEntry("JB_LOG_GRANTED_TO", [String(reward.name), String(describe(p.slot))], [0]));
    if (isAlive(p)) reward.grant(p);
    pending.delete(userId);
  });
}

/** Hot-reload handoff: pending rewards as [userId, poolIndex]. */
export function snapshot(): [number, number][] {
  return [...pending].map(([userId, r]) => [userId, r.poolIndex]);
}

export function restore(saved: unknown): void {
  if (!Array.isArray(saved)) return;
  for (const entry of saved) {
    if (!Array.isArray(entry) || entry.length !== 2) continue;
    const [userId, index] = entry as [unknown, unknown];
    const reward = typeof index === "number" ? REWARDS[index] : undefined;
    if (typeof userId === "number" && reward && Player.fromUserId(userId)) pending.set(userId, reward);
  }
}
