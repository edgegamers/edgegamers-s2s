/**
 * Speedrunners (SpeedrunDay): one player runs somewhere, everyone else must follow; each race the
 * slowest are eliminated until a few remain, and the fastest gets a weapon to finish the rest.
 *
 * Flow: setup picks a runner → at `first_round_freeze` the runner is released and their path is
 * recorded (pulsating beams) → when their time is up (or they stand still long enough) their spot
 * becomes the goal → races repeat (`startRound` → finishers checked per frame → `endRound`).
 */
import { Clients, config, Server, Vector } from "@s2script/sdk";
import type { Timer } from "@s2script/sdk";
import { Beam, HintText, Player } from "@s2script/cs2";
import type { BeamHandle } from "@s2script/cs2";
import type { DayContext, SpecialDay } from "../day.ts";
import { baseSettings, withAutoBhop, withFriendlyFire } from "../settings.ts";
import { SD_NAMES } from "../sdtype.ts";
import { DESCRIPTIONS, msg } from "../messages.ts";
import type { Vec3 } from "../geometry.ts";
import { copy, dist, dist2, hdist2 } from "../geometry.ts";
import {
  eliminationsFor,
  firstRoundSeconds,
  formatStanding,
  hasFinished,
  nextRoundSeconds,
  orderStandings,
  placeName,
  requiredDistance,
  standingMarker,
  toEliminate,
  windowAround,
} from "../rules/speedrun.ts";
import type { Standing } from "../rules/speedrun.ts";
import { BeamTrail, PlayerTrail } from "../trail.ts";
import {
  addTimeRemaining,
  alive,
  freeze,
  give,
  nameOf,
  now,
  onTeam,
  originOf,
  playing,
  setColor,
  setTakesDamage,
  setTimeRemaining,
  slay,
  strip,
  Team,
  teleport,
  teleportOnto,
  timeRemaining,
  toAll,
  toSlot,
  unfreeze,
} from "../game.ts";

const MAX_POINTS = 500;
const WHITE = { r: 255, g: 255, b: 255 };
const DODGER_BLUE = { r: 30, g: 144, b: 255 };
const GOLD = { r: 255, g: 215, b: 0 };
/** Leaderboard refresh: every N game frames (the C# repainted every tick). */
const BOARD_EVERY_FRAMES = 8;

const pick = <T>(xs: readonly T[]): T | null => (xs.length === 0 ? null : xs[Math.floor(Math.random() * xs.length)]);
const items = (s: string): string[] =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x !== "");

export function speedrunDay(): SpecialDay {
  const cfg = {
    initialTime: config.getInt("speedrun_initial_time"),
    firstFreeze: config.getInt("speedrun_first_round_freeze"),
    freezeTime: config.getInt("speedrun_freeze_time"),
    winBase: config.getInt("speedrun_win_time_base"),
    winBonus: config.getInt("speedrun_win_time_bonus"),
    winMax: config.getInt("speedrun_win_max"),
    winWeapons: items(config.getString("speedrun_win_weapons")),
    loserWeapons: items(config.getString("speedrun_loser_weapons")),
    winnerDamageable: config.getBool("speedrun_winner_damageable"),
    loserDamageable: config.getBool("speedrun_loser_damageable"),
    teleportType: config.getInt("speedrun_teleport_type"),
    finishAt: config.getInt("speedrun_finish_at"),
  };

  const settings = withFriendlyFire(
    baseSettings({
      ctTeleport: "random_stacked",
      tTeleport: "random_stacked",
      stripToKnife: true,
      convars: { mp_ignore_round_win_conditions: "1" },
      roundTime: () => cfg.initialTime + cfg.firstFreeze,
      allowedWeapons: () => new Set<string>(),
      freezeTime: () => cfg.firstFreeze,
    }),
  );
  if (Math.floor(Math.random() * 3) === 0) withAutoBhop(settings);

  // ── state ──────────────────────────────────────────────────────────────────────────────────
  let runner: number | null = null; // userId
  let start: Vec3 | null = null;
  let target: Vec3 | null = null;
  let firstTrail: PlayerTrail | null = null;
  /** The drawn "best path" everyone follows. */
  let bestBeams: BeamTrail | null = null;
  const activeTrails = new Map<number, PlayerTrail>(); // slot → invisible trail this race
  let round = 0;
  let aliveAtStart = 0;
  let roundStartTime: number | null = null;
  let roundOver = true;
  let gameOver = false;
  let bestTime: number | null = null;
  let bestTimeSlot: number | null = null;
  const finishers: Standing[] = []; // finish order
  const finishedSlots = new Set<number>();
  let roundEndTimer: Timer | null = null;
  let circle: BeamHandle[] = [];
  let frame = 0;

  const runnerPlayer = (): Player | null => (runner === null ? null : Player.fromUserId(runner));

  function getRunner(): Player | null {
    const team = Math.random() < 0.5 ? Team.Prisoner : Team.Guard;
    return pick(alive(team)) ?? alive()[0] ?? null;
  }

  function assign(p: Player): void {
    runner = p.userId;
    setColor(p, DODGER_BLUE);
  }

  function drawCircle(at: Vec3): void {
    const segments = 24;
    const r = 10;
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const b = Beam.draw(
        new Vector(at.x + Math.cos(a0) * r, at.y + Math.sin(a0) * r, at.z + 2),
        new Vector(at.x + Math.cos(a1) * r, at.y + Math.sin(a1) * r, at.z + 2),
        { color: [0, 255, 0, 255], width: 1 },
      );
      if (b) circle.push(b);
    }
  }

  function clearCircle(): void {
    for (const b of circle) b.remove();
    circle = [];
  }

  // ── the first run ──────────────────────────────────────────────────────────────────────────
  function createFirstTrail(p: Player, ctx: DayContext): PlayerTrail {
    const trail = new PlayerTrail(p.userId, MAX_POINTS, 150, (ms, fn) => ctx.every(ms, fn), true);
    trail.onDidntMove = () => {
      const current = trail.player;
      if (!current) return;
      const tps = trail.tps;
      const stillSeconds = Math.ceil(trail.didntMoveTicks / tps);
      const threshold = Math.ceil(tps * 3);
      if (start === null) {
        ctx.panic("start is null");
        return;
      }
      const runnerPos = originOf(current);
      if (runnerPos && dist2(start, runnerPos) < 100) {
        // The runner never left the start: hand the run to whoever moved and is closest to the path end.
        if (trail.didntMoveTicks <= tps * 10) return;
        const end = trail.path.newest()?.end ?? start;
        const candidates = alive().filter((q) => {
          const o = originOf(q);
          return o !== null && dist2(o, runnerPos) > 100;
        });
        candidates.sort((a, b) => dist2(originOf(a) as Vec3, end) - dist2(originOf(b) as Vec3, end));
        const next = candidates[0];
        if (!next) {
          ctx.panic("Speedrunner is invalid, and we cannot find a new one");
          return;
        }
        assign(next);
        for (const q of alive()) if (q.slot !== next.slot) teleportOnto(q, next);
        teleport(next, end);
        toAll(msg.srRunnerAfk(nameOf(next)));
        toSlot(next.slot, msg.srYouAreRunner(timeRemaining()));
        trail.startTracking(next.userId);
        trail.didntMoveTicks = 0;
        return;
      }
      if (trail.didntMoveTicks < threshold) return;
      if (trail.didntMoveTicks === threshold) toSlot(current.slot, msg.srStayStill());
      if (stillSeconds % 2 === 0) addTimeRemaining(-1);
      if (timeRemaining() <= 0) ctx.execute();
    };
    trail.onInvalid = () => {
      // The runner left mid-run: the nearest player to the path end takes over.
      const end = trail.path.newest()?.end ?? start;
      if (end === null) {
        ctx.panic("Speedrunner is invalid, and we cannot find the start");
        return;
      }
      const candidates = alive().filter((q) => originOf(q) !== null);
      candidates.sort((a, b) => dist2(originOf(a) as Vec3, end) - dist2(originOf(b) as Vec3, end));
      const next = candidates[0];
      if (!next) {
        ctx.panic("Speedrunner is invalid, and we cannot find a new one");
        return;
      }
      assign(next);
      teleport(next, end);
      toAll(msg.srRunnerLeft(nameOf(next)));
      toSlot(next.slot, msg.srYouAreRunner(timeRemaining()));
      trail.startTracking(next.userId);
    };
    return trail;
  }

  // ── races ──────────────────────────────────────────────────────────────────────────────────
  function resetTrails(ctx: DayContext): void {
    if (activeTrails.size !== 0 && finishers.length !== 0) {
      const best = finishers[0];
      if (best.slot === bestTimeSlot) {
        const t = activeTrails.get(best.slot);
        if (t) {
          t.stopTracking();
          bestBeams?.kill();
          bestBeams = BeamTrail.fromPath(t.path, (ms, fn) => ctx.every(ms, fn));
        }
      }
    }
    for (const t of activeTrails.values()) t.kill();
    activeTrails.clear();
    for (const p of alive()) {
      activeTrails.set(p.slot, new PlayerTrail(p.userId, MAX_POINTS, 500, (ms, fn) => ctx.every(ms, fn), false));
    }
  }

  function startRound(seconds: number, ctx: DayContext): void {
    roundStartTime = null;
    if (!ctx.active || start === null) return;
    const racers = alive();
    aliveAtStart = racers.length;
    round += 1;
    toAll(msg.srBeginRound(round, eliminationsFor(aliveAtStart), seconds));
    setTimeRemaining(seconds + cfg.freezeTime);
    for (const p of racers) {
      teleport(p, start, true);
      freeze(p);
    }
    resetTrails(ctx);
    finishers.length = 0;
    finishedSlots.clear();
    roundOver = false;

    ctx.after(cfg.freezeTime * 1000, () => {
      for (const p of alive()) unfreeze(p);
      roundStartTime = now();
    });
    roundEndTimer?.kill();
    roundEndTimer = ctx.after((seconds + cfg.freezeTime) * 1000, () => endRound(ctx));
  }

  function onFinish(p: Player, ctx: DayContext): void {
    if (roundStartTime === null) return;
    const time = now() - roundStartTime;
    if (bestTime === null || time < bestTime) {
      bestTime = time;
      bestTimeSlot = p.slot;
      toAll(msg.srBestTime(nameOf(p), time));
      setColor(p, GOLD);
    } else {
      const position = finishers.length + 1;
      toAll(msg.srFinished(nameOf(p), placeName(position), position, time));
    }
    finishers.push({ slot: p.slot, finished: true, value: time });
    finishedSlots.add(p.slot);
    activeTrails.get(p.slot)?.stopTracking();

    const taking = aliveAtStart - eliminationsFor(alive().length);
    const done = finishers.length >= taking;
    if (bestTimeSlot !== p.slot) setColor(p, WHITE, Math.max(255 - finishers.length * 20, 0));
    if (done) endRound(ctx);
  }

  function checkFinishers(ctx: DayContext): void {
    if (target === null || roundStartTime === null || roundOver || gameOver) return;
    const required = requiredDistance(now() - roundStartTime);
    const others: Standing[] = [];
    for (const p of alive()) {
      if (finishedSlots.has(p.slot)) continue;
      const pos = originOf(p);
      if (!pos) continue;
      if (hasFinished(dist2(pos, target), hdist2(pos, target), required)) {
        onFinish(p, ctx);
        if (roundOver) return;
        continue;
      }
      others.push({ slot: p.slot, finished: false, value: dist(pos, target) });
    }
    if (++frame % BOARD_EVERY_FRAMES === 0) sendBoard(orderStandings(finishers, others));
  }

  /** The center leaderboard (the C# PrintToCenterHtml view, as plain hint text). */
  function sendBoard(order: Standing[]): void {
    const eliminations = eliminationsFor(aliveAtStart);
    const lines = order.map((s, i) => {
      const p = Player.fromSlot(s.slot);
      const name = p?.playerName ?? "?";
      return formatStanding(i + 1, name, s, standingMarker(i + 1, s.finished, eliminations, aliveAtStart));
    });
    const view = (index: number): string => {
      const [a, b] = windowAround(lines.length, index);
      return lines.slice(a, b).join("\n");
    };
    order.forEach((s, i) => {
      if (Clients.fromSlot(s.slot)?.isBot) return;
      HintText.to(s.slot, view(i));
    });
    if (lines.length === 0) return;
    const top = view(0);
    for (const p of Player.all()) if (p.pawnIsAlive === false && !Clients.fromSlot(p.slot)?.isBot) HintText.to(p.slot, top);
  }

  function eliminate(p: Player): void {
    setTakesDamage(p, true);
    slay(p);
    toAll(msg.srEliminated(nameOf(p)));
  }

  function endRound(ctx: DayContext): void {
    if (roundOver || gameOver) return;
    roundOver = true;
    roundEndTimer?.kill();
    roundEndTimer = null;
    if (target === null) {
      ctx.panic("endRound: Target is null");
      return;
    }
    if (!ctx.active) return;

    const racers = alive();
    const aliveCount = racers.length;
    let eliminating = toEliminate(aliveCount, aliveAtStart);
    let ctMade = onTeam(Team.Guard).length < 4;
    let tMade = onTeam(Team.Prisoner).length < 4;

    const nonCompleters: Standing[] = [];
    for (const p of racers) {
      if (p.teamNum === Team.Guard) ctMade = true;
      if (p.teamNum === Team.Prisoner) tMade = true;
      if (finishedSlots.has(p.slot)) continue;
      finishedSlots.add(p.slot);
      const pos = originOf(p);
      if (pos) nonCompleters.push({ slot: p.slot, finished: false, value: dist(pos, target) });
    }
    const order = orderStandings(finishers, nonCompleters);

    if (aliveCount > 1 && ctMade !== tMade && round === 1) {
      // Only one team could reach the goal: take a path from the other team instead.
      const other = pick(alive(tMade ? Team.Guard : Team.Prisoner));
      const otherTrail = other ? activeTrails.get(other.slot) : undefined;
      if (other && otherTrail) {
        toAll(msg.srImpossible(ctMade ? "Prisoners" : "Guards", nameOf(other)));
        otherTrail.stopTracking();
        bestBeams?.kill();
        bestBeams = BeamTrail.fromPath(otherTrail.path, (ms, fn) => ctx.every(ms, fn));
        const newEnd = otherTrail.path.newest()?.end;
        if (newEnd) {
          target = copy(newEnd);
          clearCircle();
          drawCircle(target);
        }
      }
      eliminating = 2;
      round -= 1;
    }

    // announceTimes: tell each non-finisher how far they were.
    order.forEach((s, i) => {
      if (s.finished) return;
      const p = Player.fromSlot(s.slot);
      if (p) toSlot(p.slot, msg.srDistance(nameOf(p), placeName(i + 1), i + 1, s.value));
    });

    if (aliveCount <= cfg.finishAt) {
      win(order, ctx);
      return;
    }

    const roundTook = roundStartTime === null ? 0 : now() - roundStartTime;
    if (eliminating <= 0) {
      toAll(msg.srNoneEliminated());
      const next = nextRoundSeconds(bestTime, round, roundTook, false);
      ctx.after(3000, () => startRound(next, ctx));
      return;
    }
    const next = nextRoundSeconds(bestTime, round, roundTook, true);

    const slowestFirst = [...order].reverse();
    const eliminated = new Set<number>();
    if (ctMade !== tMade && round === 0) {
      // First race on a map half only one team could reach: one from each team goes.
      for (const team of [Team.Guard, Team.Prisoner]) {
        const s = slowestFirst.find((x) => Player.fromSlot(x.slot)?.teamNum === team);
        const p = s ? Player.fromSlot(s.slot) : null;
        if (!p) continue;
        eliminate(p);
        eliminated.add(p.slot);
        eliminating--;
      }
    }
    for (const s of slowestFirst) {
      if (eliminating <= 0) break;
      if (eliminated.has(s.slot)) continue;
      const p = Player.fromSlot(s.slot);
      if (!p) continue;
      eliminate(p);
      eliminated.add(s.slot);
      eliminating--;
    }
    ctx.after(3000, () => startRound(next, ctx));
  }

  function win(order: Standing[], ctx: DayContext): void {
    const first = order[0];
    const winner = first ? Player.fromSlot(first.slot) : null;
    if (!winner) {
      ctx.panic("endRound: Winner is null");
      return;
    }
    gameOver = true;
    clearCircle();
    const losers = alive().filter((p) => p.slot !== winner.slot);
    toAll(msg.srWon(nameOf(winner)));
    for (const loser of losers) {
      setColor(loser, WHITE);
      if (cfg.teleportType === 1) teleportOnto(loser, winner);
      else if (cfg.teleportType === 2) teleportOnto(winner, loser);
      if (cfg.loserDamageable) setTakesDamage(loser, true);
    }
    if (cfg.winnerDamageable) setTakesDamage(winner, true);
    ctx.disarmPickups();
    for (const w of cfg.loserWeapons) for (const loser of losers) give(loser, w);
    for (const w of cfg.winWeapons) give(winner, w);
    setTimeRemaining(Math.min(cfg.winBase + cfg.winBonus * losers.length, cfg.winMax));
    Server.setCvar("mp_ignore_round_win_conditions", "0");
  }

  // ── the day ────────────────────────────────────────────────────────────────────────────────
  return {
    type: "speedrun",
    name: SD_NAMES.speedrun,
    description: DESCRIPTIONS.speedrun,
    settings,
    skipBaseExecute: true,
    setup(ctx) {
      for (const p of playing()) if (p.pawnIsAlive === false) p.respawn();
      const first = getRunner();
      if (!first) {
        ctx.panic("Could not find a speedrunner");
        return;
      }
      runner = first.userId;

      ctx.at(0.1, () => {
        // Players who respawned get their knife late: strip again, ghost everyone but the runner.
        for (const p of alive()) {
          strip(p);
          if (p.userId !== runner) setColor(p, WHITE, 100);
        }
      });
      ctx.at(cfg.firstFreeze - 4, () => {
        const p = runnerPlayer() ?? getRunner();
        if (!p) {
          ctx.panic("Speedrunner is invalid, and we cannot find a new one");
          return;
        }
        assign(p);
        toAll(msg.srRunnerAssigned(nameOf(p)));
        toSlot(p.slot, msg.srYouAreRunner(cfg.initialTime));
      });
      ctx.at(cfg.firstFreeze, () => {
        let p = runnerPlayer();
        if (!p) {
          p = getRunner();
          if (!p) {
            ctx.panic("Original speedrunner is invalid, and we cannot find a new one");
            return;
          }
          assign(p);
          toAll(msg.srRunnerLeft(nameOf(p)));
          toSlot(p.slot, msg.srYouAreRunner(cfg.initialTime));
        }
        start = originOf(p);
        unfreeze(p);
        firstTrail = createFirstTrail(p, ctx);
      });
      const runEnds = cfg.initialTime + cfg.firstFreeze;
      if (cfg.initialTime > 30) {
        ctx.at(runEnds - 30, () => {
          if (target !== null) return;
          const p = runnerPlayer() ?? getRunner();
          if (!p) {
            ctx.panic("Original speedrunner is invalid, and we cannot find a new one");
            return;
          }
          toSlot(p.slot, msg.srRuntimeLeft(timeRemaining()));
        });
      }
      ctx.at(runEnds - 10, () => {
        const p = runnerPlayer();
        if (target === null && p) toSlot(p.slot, msg.srRuntimeLeft(timeRemaining()));
      });
      ctx.at(runEnds, () => ctx.execute());
    },
    execute(ctx) {
      const p = runnerPlayer();
      if (!p) {
        ctx.panic("Execute: Speedrunner is null");
        return;
      }
      const at = originOf(p);
      if (!at) {
        ctx.panic("Execute: Could not get the speedrunner's position");
        return;
      }
      if (start === null || dist2(start, at) < 100) {
        ctx.panic("Execute: Start is null or too close to speedrunner");
        return;
      }
      target = copy(at);
      drawCircle(target);
      if (!firstTrail) {
        toAll(msg.error("Execute: bestTrail is null"));
        return;
      }
      bestBeams = firstTrail.detachBeams();
      bestTime = firstTrail.path.duration();
      startRound(firstRoundSeconds(bestTime, cfg.initialTime), ctx);
    },
    onFrame(ctx) {
      checkFinishers(ctx);
    },
    teardown() {
      roundEndTimer?.kill();
      firstTrail?.kill();
      bestBeams?.kill();
      for (const t of activeTrails.values()) t.kill();
      activeTrails.clear();
      clearCircle();
    },
  };
}
