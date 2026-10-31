/** The live guard queue: join/leave, notices, round-start fill, round-end trim (CTBans QueueService). */
import { Chat } from "@s2script/sdk";
import { Player } from "@s2script/cs2";
import { Team } from "@edgegamers/jailbreak-shared";
import { activeBan } from "./ctbans";
import { settings } from "./config";
import { playerBySteam, pub, toSteam } from "./env";
import { msg } from "./messages";
import { effectiveOf } from "./players";
import { GuardQueue, type Notice } from "./queue";

export const queue = new GuardQueue();
const restartedBy = new Set<string>();

function send(n: Notice): void {
  const line =
    n.kind === "probability" ? msg.positionProbability(n.chance, n.position, n.size)
    : n.kind === "priority" ? msg.positionPriority(n.position, n.size)
    : msg.positionMoved(n.position, n.size);
  toSteam(n.steamId, line);
}

function changed(): void {
  pub()?.emit("OnQueueChanged", { size: queue.size() });
}

/** Add an online player (all !guard checks already passed). */
export function joinQueue(slot: number): void {
  const p = Player.fromSlot(slot);
  if (!p) return;
  const r = queue.add(p.steamId, effectiveOf, settings().normalCap, Math.random);
  for (const n of r.notices) send(n);
  if (r.skippedByChance > 0) Chat.toSlot(slot, msg.guardSkipped(r.skippedByChance));
  Chat.toSlot(slot, msg.guardQueued(queue.position(p.steamId) + 1, queue.size()));
  changed();
}

export function leaveQueue(steamId: string): boolean {
  if (!queue.has(steamId)) return false;
  for (const n of queue.remove(steamId)) send(n);
  changed();
  return true;
}

/** Move up to `count` queued players to CT. Returns false if the queue ran dry first. */
export function fillGuards(count: number): boolean {
  queue.removeWhere((id) => playerBySteam(id) === null);
  let moved = 0;
  while (moved < count) {
    const id = queue.popFront();
    if (id === undefined) break;
    const p = playerBySteam(id);
    if (!p || activeBan(id)) continue;
    if (p.teamNum === Team.Guard) continue;
    p.changeTeam(Team.Guard);
    moved++;
  }
  if (moved > 0) {
    for (const n of queue.movedFrom(0)) send(n);
    changed();
  }
  return moved === count;
}

/** Move the `count` lowest-priority guards to T and re-queue them. */
export function trimGuards(count: number): void {
  const guards = Player.allConnected()
    .filter((p) => p.teamNum === Team.Guard && p.steamId !== "0")
    .sort((a, b) => effectiveOf(a.steamId) - effectiveOf(b.steamId));
  for (const p of guards.slice(0, count)) {
    p.changeTeam(Team.Prisoner);
    Chat.toSlot(p.slot, msg.swapped());
    Chat.toSlot(p.slot, msg.readded());
    joinQueue(p.slot);
  }
}

export function clearQueue(): void {
  for (const id of queue.clear()) toSteam(id, msg.leaveRemoved());
  changed();
}

export function resetRoundRestarts(): void {
  restartedBy.clear();
}

/** True the first time `steamId` triggers the empty-CT restart this round. */
export function markRestartUsed(steamId: string): boolean {
  if (restartedBy.has(steamId)) return false;
  restartedBy.add(steamId);
  return true;
}
