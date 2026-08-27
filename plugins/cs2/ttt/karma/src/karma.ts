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
  join(slot: number, steamId: string): void;
  leave(slot: number, steamId: string): void;
  grantRound(slot: number, won: boolean): void;
  scoreKill(input: KarmaKillInput): void;
  resetRound(): void;
  serveTimeout(slot: number): boolean;
}

export interface KarmaServiceOptions {
  now?: () => number;
  onLowKarma?: (slot: number, command: string) => void;
}

const MAX_SLOTS = 64;

export interface FirstDamageHistory {
  recordDamage(attacker: number, victim: number): void;
  startedFight(attacker: number, victim: number): boolean;
  clearSlot(slot: number): void;
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
    clearSlot(slot) {
      if (slot < 0 || slot >= MAX_SLOTS) return;
      for (let other = 0; other < MAX_SLOTS; other++) {
        firstDamage[indexOf(slot, other)] = 0;
        firstDamage[indexOf(other, slot)] = 0;
      }
    },
    clear() {
      firstDamage.fill(0);
    },
  };
}

export function createKarmaService(
  config: KarmaConfig | (() => KarmaConfig),
  options: KarmaServiceOptions = {},
): KarmaService {
  const values = new Float64Array(MAX_SLOTS);
  const initialized = new Uint8Array(MAX_SLOTS);
  const pending = new Float64Array(MAX_SLOTS);
  const timeout = new Int32Array(MAX_SLOTS);
  const badKills = new Int32Array(MAX_SLOTS);
  const lastWarned = new Float64Array(MAX_SLOTS);
  const suppressKill = new Uint8Array(MAX_SLOTS);
  const connected = new Uint8Array(MAX_SLOTS);
  const steamIds = Array<string>(MAX_SLOTS).fill("");
  const persistedKarma = new Map<string, number>();
  const persistedTimeout = new Map<string, number>();
  const persistedWarning = new Map<string, number>();
  const settings = (): KarmaConfig => typeof config === "function" ? config() : config;

  function validSlot(slot: number): boolean {
    return slot >= 0 && slot < MAX_SLOTS;
  }

  function validSteamId(steamId: string): boolean {
    return steamId !== "" && steamId !== "0";
  }

  function clearSlot(slot: number): void {
    if (!validSlot(slot)) return;
    values[slot] = 0;
    initialized[slot] = 0;
    pending[slot] = 0;
    timeout[slot] = 0;
    badKills[slot] = 0;
    lastWarned[slot] = 0;
    suppressKill[slot] = 0;
    connected[slot] = 0;
    steamIds[slot] = "";
  }

  function persistSlot(slot: number): void {
    const steamId = steamIds[slot] ?? "";
    if (!validSteamId(steamId)) return;
    persistedKarma.set(steamId, values[slot]!);
    persistedTimeout.set(steamId, timeout[slot]!);
    persistedWarning.set(steamId, lastWarned[slot]!);
  }

  function ensure(slot: number): void {
    if (!validSlot(slot) || initialized[slot] === 1) return;
    initialized[slot] = 1;
    values[slot] = settings().defaultKarma;
  }

  function setKarma(slot: number, value: number): void {
    ensure(slot);
    const rounded = Math.round(value);
    const current = settings();
    if (rounded < current.minKarma && connected[slot] === 1) {
      values[slot] = current.defaultKarma;
      persistSlot(slot);
      options.onLowKarma?.(slot, current.lowKarmaCommand);
      return;
    }
    values[slot] = rounded;
    benchLowKarma(slot, rounded);
    persistSlot(slot);
  }

  function benchLowKarma(slot: number, value: number): void {
    const current = settings();
    if (value >= current.timeoutThreshold) return;
    const now = options.now?.() ?? Date.now();
    if (now - lastWarned[slot]! <= current.warningWindowMs) return;
    lastWarned[slot] = now;
    timeout[slot] = current.timeoutRounds;
    persistSlot(slot);
  }

  function queueKarma(slot: number, delta: number): void {
    ensure(slot);
    pending[slot] = (pending[slot] ?? 0) + delta;
  }

  function scoreKill(input: KarmaKillInput): void {
    const suppressed = validSlot(input.victimSlot) && suppressKill[input.victimSlot] === 1;
    if (validSlot(input.victimSlot)) suppressKill[input.victimSlot] = 0;
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

    if (suppressed) return;
    queueKarma(input.killerSlot, killerDelta * multiplier);
    queueKarma(input.victimSlot, victimDelta);
  }

  return {
    join(slot, steamId) {
      if (!validSlot(slot)) return;
      clearSlot(slot);
      steamIds[slot] = steamId;
      connected[slot] = 1;
      initialized[slot] = 1;
      values[slot] = validSteamId(steamId)
        ? (persistedKarma.get(steamId) ?? settings().defaultKarma)
        : settings().defaultKarma;
      timeout[slot] = validSteamId(steamId) ? (persistedTimeout.get(steamId) ?? 0) : 0;
      lastWarned[slot] = validSteamId(steamId) ? (persistedWarning.get(steamId) ?? 0) : 0;
    },
    leave(slot, steamId) {
      if (!validSlot(slot)) return;
      const id = steamIds[slot] || steamId;
      if (initialized[slot] === 1) {
        values[slot] = Math.round(values[slot]! + pending[slot]!);
        pending[slot] = 0;
        if (values[slot]! >= settings().minKarma) benchLowKarma(slot, values[slot]!);
        if (validSteamId(id) && steamIds[slot] !== id) steamIds[slot] = id;
        persistSlot(slot);
      }
      clearSlot(slot);
    },
    grantRound(slot, won) {
      const current = settings();
      queueKarma(slot, won ? current.perWinKarma : current.perRoundKarma);
    },
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
    timeoutThreshold() {
      return settings().timeoutThreshold;
    },
    timeoutRemaining(slot) {
      return timeout[slot] ?? 0;
    },
    clearTimeout(slot) {
      timeout[slot] = 0;
      lastWarned[slot] = 0;
      persistSlot(slot);
    },
    scoreKill,
    resetRound() {
      badKills.fill(0);
      suppressKill.fill(0);
    },
    serveTimeout(slot) {
      const remaining = timeout[slot] ?? 0;
      if (remaining <= 0) return false;
      timeout[slot] = remaining - 1;
      persistSlot(slot);
      return true;
    },
    suppressNextDeathPenalty(victimSlot) {
      if (validSlot(victimSlot)) suppressKill[victimSlot] = 1;
    },
  };
}
