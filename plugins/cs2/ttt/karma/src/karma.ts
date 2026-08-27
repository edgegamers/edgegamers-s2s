import type { TttKarmaApi } from "../api";
import { karmaScoreDeltas, type KarmaConfig } from "./config.ts";

export type { KarmaConfig } from "./config.ts";

export interface KarmaKillInput {
  killerSlot: number;
  victimSlot: number;
  killerTeam: "innocent" | "traitor" | "spectator";
  victimTeam: "innocent" | "traitor" | "spectator";
  killerRole: string;
  victimRole: string;
  victimStartedFight: boolean;
  killerStartedFight: boolean;
}

export interface KarmaService extends TttKarmaApi {
  scoreKill(input: KarmaKillInput): void;
  resetRound(): void;
  serveTimeout(slot: number): boolean;
}

const MAX_SLOTS = 64;

export interface FirstDamageHistory {
  recordDamage(attacker: number, victim: number): void;
  startedFight(attacker: number, victim: number): boolean;
  clear(): void;
}

export function createFirstDamageHistory(): FirstDamageHistory {
  const firstDamage = new Uint8Array(MAX_SLOTS * MAX_SLOTS);
  const validPair = (attacker: number, victim: number): boolean =>
    attacker >= 0 && attacker < MAX_SLOTS && victim >= 0 && victim < MAX_SLOTS && attacker !== victim;
  const indexOf = (attacker: number, victim: number): number => attacker * MAX_SLOTS + victim;

  return {
    recordDamage(attacker, victim) {
      if (!validPair(attacker, victim) || firstDamage[indexOf(victim, attacker)] === 1) return;
      firstDamage[indexOf(attacker, victim)] = 1;
    },
    startedFight(attacker, victim) {
      return validPair(attacker, victim) && firstDamage[indexOf(attacker, victim)] === 1;
    },
    clear() {
      firstDamage.fill(0);
    },
  };
}

export function createKarmaService(config: KarmaConfig | (() => KarmaConfig)): KarmaService {
  const values = new Float64Array(MAX_SLOTS);
  const initialized = new Uint8Array(MAX_SLOTS);
  const pending = new Float64Array(MAX_SLOTS);
  const timeout = new Int32Array(MAX_SLOTS);
  const badKills = new Int32Array(MAX_SLOTS);
  const settings = (): KarmaConfig => typeof config === "function" ? config() : config;

  function ensure(slot: number): void {
    if (slot < 0 || slot >= MAX_SLOTS || initialized[slot] === 1) return;
    initialized[slot] = 1;
    values[slot] = settings().defaultKarma;
  }

  function setKarma(slot: number, value: number): void {
    ensure(slot);
    values[slot] = Math.round(value);
    const current = settings();
    if (values[slot]! < current.timeoutThreshold) timeout[slot] = current.timeoutRounds;
  }

  function queueKarma(slot: number, delta: number): void {
    ensure(slot);
    pending[slot] = (pending[slot] ?? 0) + delta;
  }

  function scoreKill(input: KarmaKillInput): void {
    if (
      input.killerSlot < 0
      || input.victimSlot < 0
      || input.killerSlot === input.victimSlot
      || input.killerTeam === "spectator"
      || input.victimTeam === "spectator"
    ) return;

    const delta = karmaScoreDeltas(settings());
    let killerGuilty = input.killerStartedFight;
    const victimGuilty = input.victimStartedFight;
    if (!killerGuilty && !victimGuilty) killerGuilty = true;

    let killerDelta = 0;
    let victimDelta = 0;
    let multiplier = 1;
    const sameTeam = input.killerTeam === input.victimTeam;
    if (sameTeam) {
      if (killerGuilty) badKills[input.killerSlot] = badKills[input.killerSlot]! + 1;
      multiplier = Math.max(1, badKills[input.killerSlot]!);
    }

    if (input.killerTeam === "innocent" && input.victimTeam === "traitor") {
      killerDelta = delta.innocentOnTraitor;
    } else if (input.killerTeam === "traitor" && input.victimRole === "ttt:detective") {
      killerDelta = delta.traitorOnDetective;
    } else if (sameTeam && input.killerTeam === "innocent") {
      if (input.victimRole === "ttt:detective") {
        killerDelta = killerGuilty ? delta.innocentOnDetectiveGuilty : delta.innocentOnDetectiveRetaliation;
        victimDelta = victimGuilty ? delta.detectiveVictimGuilty : delta.detectiveVictimInnocent;
      } else {
        killerDelta = killerGuilty ? delta.innocentSameTeamGuilty : delta.innocentSameTeamRetaliation;
        victimDelta = victimGuilty ? delta.innocentSameTeamVictimGuilty : delta.innocentSameTeamVictimInnocent;
      }
    } else if (sameTeam && input.killerTeam === "traitor") {
      killerDelta = killerGuilty ? delta.traitorSameTeamGuilty : delta.traitorSameTeamRetaliation;
      victimDelta = victimGuilty ? delta.traitorSameTeamVictimGuilty : delta.traitorSameTeamVictimInnocent;
    } else {
      return;
    }

    queueKarma(input.killerSlot, killerDelta * multiplier);
    queueKarma(input.victimSlot, victimDelta);
  }

  return {
    karmaOf(slot) {
      ensure(slot);
      return values[slot] ?? settings().defaultKarma;
    },
    setKarma,
    queueKarma,
    flushKarma() {
      for (let slot = 0; slot < MAX_SLOTS; slot++) {
        const delta = pending[slot]!;
        if (delta === 0) continue;
        pending[slot] = 0;
        setKarma(slot, values[slot]! + delta);
      }
    },
    timeoutRemaining(slot) {
      return timeout[slot] ?? 0;
    },
    clearTimeout(slot) {
      timeout[slot] = 0;
    },
    scoreKill,
    resetRound() {
      badKills.fill(0);
    },
    serveTimeout(slot) {
      const remaining = timeout[slot] ?? 0;
      if (remaining <= 0) return false;
      timeout[slot] = remaining - 1;
      return true;
    },
    suppressNextDeathPenalty() {
      return undefined;
    },
  };
}
