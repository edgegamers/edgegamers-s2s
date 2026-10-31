// SharpTimer / community trigger-name conventions (pure, unit-tested in node).
//
//   start  map_start | s1_start | stage1_start | timer_startzone | zone_start | <MapStartTrigger>
//   end    map_end | timer_endzone | zone_end | <MapEndTrigger>
//   stage  sN_start | stageN_start          (N >= 2; stage 1 is the map start)
//   cp     map_cpN | map_checkpointN
//   bonus  bN_start | bonusN_start | timer_bonusN_startzone, and the matching _end / _endzone
//   bonus cp  bonus_cpN | bonus_checkpointN
//   stop   st_stop | surftimer_stop | timer_stop      reset  st_reset | surftimer_reset | timer_reset
export const ZoneKind = { Start: 1, End: 2, Stage: 3, Checkpoint: 4, Stop: 5, Reset: 6 } as const;
export type ZoneKind = (typeof ZoneKind)[keyof typeof ZoneKind];

export interface ZoneDef {
  kind: ZoneKind;
  /** 0 = main, N = bonus N. */
  track: number;
  /** Stage number (Stage) or checkpoint number (Checkpoint); 0 otherwise. */
  index: number;
  /** Listed in MapData's OverrideMaxSpeedLimit: leaving this zone is never speed-capped. */
  noCap?: true;
}

interface Custom { start: string; end: string; }
const custom: Custom = { start: "", end: "" };

/** MapData's MapStartTrigger / MapEndTrigger (lower-cased; "" clears). */
export function setCustomNames(start: string, end: string): void {
  custom.start = start.toLowerCase();
  custom.end = end.toLowerCase();
}

const START_NAMES = new Set(["map_start", "s1_start", "stage1_start", "timer_startzone", "zone_start"]);
const END_NAMES = new Set(["map_end", "timer_endzone", "zone_end"]);
const STOP_NAMES = new Set(["st_stop", "surftimer_stop", "timer_stop"]);
const RESET_NAMES = new Set(["st_reset", "surftimer_reset", "timer_reset"]);
const RE_STAGE = /^(?:s|stage)(\d+)_start$/;
const RE_CP = /^map_(?:cp|checkpoint)(\d+)$/;
const RE_BONUS_START = /^(?:b|bonus)(\d+)_start$|^timer_bonus(\d+)_startzone$/;
const RE_BONUS_END = /^(?:b|bonus)(\d+)_end$|^timer_bonus(\d+)_endzone$/;
const RE_BONUS_CP = /^bonus_(?:cp|checkpoint)(\d+)$/;

const noCapNames = new Set<string>();

/** MapData's OverrideMaxSpeedLimit: comma-separated trigger names exempt from the pre-speed cap. */
export function setNoCapNames(list: string): void {
  noCapNames.clear();
  for (const s of list.split(",")) {
    const n = s.trim().toLowerCase();
    if (n) noCapNames.add(n);
  }
}

/** Classify a trigger name; null for triggers that are not timer zones. */
export function classify(name: string): ZoneDef | null {
  if (!name) return null;
  const n = name.toLowerCase();
  const def = classifyLower(n);
  if (def && noCapNames.has(n)) def.noCap = true;
  return def;
}

function classifyLower(n: string): ZoneDef | null {
  if (START_NAMES.has(n) || (custom.start !== "" && n === custom.start)) return { kind: ZoneKind.Start, track: 0, index: 1 };
  if (END_NAMES.has(n) || (custom.end !== "" && n === custom.end)) return { kind: ZoneKind.End, track: 0, index: 0 };
  let m = RE_STAGE.exec(n);
  if (m) {
    const s = Number(m[1]);
    return s <= 1 ? { kind: ZoneKind.Start, track: 0, index: 1 } : { kind: ZoneKind.Stage, track: 0, index: s };
  }
  m = RE_CP.exec(n);
  if (m) return { kind: ZoneKind.Checkpoint, track: 0, index: Number(m[1]) };
  m = RE_BONUS_START.exec(n);
  if (m) return { kind: ZoneKind.Start, track: Number(m[1] ?? m[2]), index: 1 };
  m = RE_BONUS_END.exec(n);
  if (m) return { kind: ZoneKind.End, track: Number(m[1] ?? m[2]), index: 0 };
  m = RE_BONUS_CP.exec(n);
  if (m) return { kind: ZoneKind.Checkpoint, track: -1, index: Number(m[1]) };   // track resolved by the run
  if (STOP_NAMES.has(n)) return { kind: ZoneKind.Stop, track: 0, index: 0 };
  if (RESET_NAMES.has(n)) return { kind: ZoneKind.Reset, track: 0, index: 0 };
  return null;
}

