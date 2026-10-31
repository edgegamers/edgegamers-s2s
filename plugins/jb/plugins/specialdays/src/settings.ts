/**
 * Per-day settings (SpecialDaySettings): what the shared setup does before a day's own logic runs.
 * Pure data + builders; the runner (`runner.ts`) applies them.
 */

/** Where players are teleported at setup (SpecialDaySettings.TeleportType). */
export type TeleportType =
  | "none"
  /** Random CT spawns. */
  | "armory"
  /** One CT spawn for everyone. */
  | "armory_stacked"
  /** Random T spawns. */
  | "cell"
  /** One T spawn for everyone. */
  | "cell_stacked"
  /** Random spots across the map (spawn zones, teleport destinations, spawns). */
  | "random"
  /** One random spot for everyone. */
  | "random_stacked";

/** What settings callbacks may look at. */
export interface PlayerLike {
  teamNum: number | null;
}

export interface DaySettings {
  allowLastGuard: boolean;
  allowLastRequests: boolean;
  allowRebels: boolean;
  ctTeleport: TeleportType;
  tTeleport: TeleportType;
  freezePlayers: boolean;
  openCells: boolean;
  respawnPlayers: boolean;
  /** Everyone is immune to damage until the day executes. */
  startInvulnerable: boolean;
  /** Strip everyone to a knife at setup. */
  stripToKnife: boolean;
  /** Convars set for the day (restored at round end). Values are console strings. */
  convars: Record<string, string>;
  /** Round length in seconds, applied at setup. */
  roundTime: () => number;
  /** Weapons a player may pick up once the day executes; null = no restriction. */
  allowedWeapons: (p: PlayerLike) => ReadonlySet<string> | null;
  /** Seconds after setup until a frozen player is released. */
  freezeTime: (p: PlayerLike) => number;
  /** -1 = leave unchanged. */
  initialHealth: (p: PlayerLike) => number;
  initialMaxHealth: (p: PlayerLike) => number;
  initialArmor: (p: PlayerLike) => number;
}

export function baseSettings(over: Partial<DaySettings> = {}): DaySettings {
  return {
    allowLastGuard: false,
    allowLastRequests: false,
    allowRebels: false,
    ctTeleport: "none",
    tTeleport: "none",
    freezePlayers: true,
    openCells: true,
    respawnPlayers: true,
    startInvulnerable: true,
    stripToKnife: true,
    convars: {},
    roundTime: () => 60 * 5,
    allowedWeapons: () => null,
    freezeTime: () => 3,
    initialHealth: () => 100,
    initialMaxHealth: () => 100,
    initialArmor: () => 0,
    ...over,
  };
}

/** Everyone can damage everyone (WithFriendlyFire). */
export function withFriendlyFire(s: DaySettings): DaySettings {
  s.convars["mp_teammates_are_enemies"] = "1";
  s.convars["ff_damage_reduction_bullets"] = "1.0";
  s.convars["ff_damage_reduction_grenade"] = "1.0";
  s.convars["ff_damage_reduction_other"] = "1.0";
  return s;
}

/** Respawn on death for one or both teams (WithRespawns). */
export function withRespawns(s: DaySettings, team: "both" | "prisoner" | "guard" = "both"): DaySettings {
  if (team !== "guard") s.convars["mp_respawn_on_death_t"] = "1";
  if (team !== "prisoner") s.convars["mp_respawn_on_death_ct"] = "1";
  return s;
}

/** Auto bunny-hopping (WithAutoBhop). */
export function withAutoBhop(s: DaySettings): DaySettings {
  s.convars["sv_enablebunnyhopping"] = "1";
  s.convars["sv_autobunnyhopping"] = "1";
  return s;
}

/** FFA-style staggered release: 2–7 seconds (`rng.NextSingle() * 5 + 2`). */
export function randomFreeze(rng: () => number = Math.random): () => number {
  return () => rng() * 5 + 2;
}

/**
 * Convars that only take effect client-side after a frame: the C# set the old value, then the new
 * one on the next frame.
 */
export const FRAME_DELAYED_CONVARS: ReadonlySet<string> = new Set([
  "mp_teammates_are_enemies",
  "sv_autobunnyhopping",
  "mp_death_drop_gun",
]);
