/**
 * The enum-perk engine — the one generic replacement for the C# `AbstractEnumCommand`,
 * `AbstractEnumMenu` and the six `*Perk`/`*Command`/`*Menu` classes. Pure: stat values in,
 * decisions out. The SDK-facing glue (commands, menus, transforms) lives in `commands.ts`,
 * `menus.ts` and `bridges.ts`.
 */
import type { EnumPerkDef, PerkOption } from "./perks.ts";

/** A stored stat value as Gangs returns it (`@edgegamers/gangs` StatValue). */
export type StatValue = string | number | boolean | null;

/** A gang-scope perk's stat: `{"Unlocked":mask,"Equipped":bit}` (the C# `*Data` classes). */
export interface GangPerkData {
  Unlocked: number;
  Equipped: number;
}

/** Random source in [0, 1) — `Math.random` in production, fixed in tests. */
export type Rand = () => number;

// ── masks ───────────────────────────────────────────────────────────────────────────────────────

/** Every option bit OR-ed together. */
export function allBits(def: EnumPerkDef): number {
  return def.options.reduce((m, o) => m | o.bit, 0);
}

/** Bits of free (cost 0) options: always unlocked, no purchase needed. */
export function freeBits(def: EnumPerkDef): number {
  return def.options.reduce((m, o) => (o.cost === 0 ? m | o.bit : m), 0);
}

/** The option with exactly this bit, or null. */
export function optionByBit(def: EnumPerkDef, bit: number): PerkOption | null {
  return def.options.find((o) => o.bit === bit) ?? null;
}

/** The option with this C# enum name (case-insensitive, spaces/dashes read as `_`), or null. */
export function optionByName(def: EnumPerkDef, name: string): PerkOption | null {
  const key = name.trim().toUpperCase().replace(/[\s-]+/g, "_");
  return def.options.find((o) => o.name === key) ?? null;
}

/**
 * Parse a stored flags value. C# wrote enums as JSON numbers; a value written with a string-enum
 * converter (`"KING, QUEEN"`) is also accepted. Unknown bits are dropped; garbage is 0.
 */
export function parseMask(def: EnumPerkDef, raw: StatValue | undefined): number {
  if (typeof raw === "number") return Number.isSafeInteger(raw) && raw > 0 ? raw & allBits(def) : 0;
  if (typeof raw !== "string") return 0;
  const t = raw.trim();
  if (/^\d+$/.test(t)) return parseMask(def, Number(t));
  let mask = 0;
  for (const part of t.split(",")) {
    const o = optionByName(def, part);
    if (o) mask |= o.bit;
  }
  return mask;
}

/** The gang's unlocked mask, including the free options. */
export function unlockedMask(def: EnumPerkDef, stored: number): number {
  return (stored | freeBits(def)) & allBits(def);
}

/** C# `HasFlag`: every bit of `opt` is set in `mask`. */
export function isUnlocked(mask: number, opt: PerkOption): boolean {
  return (mask & opt.bit) === opt.bit;
}

/** Add an option to an unlocked mask. */
export function unlock(mask: number, opt: PerkOption): number {
  return mask | opt.bit;
}

/** Parse a player's equipped option (a single bit) — null for unset/invalid. */
export function parseEquipped(def: EnumPerkDef, raw: StatValue | undefined): PerkOption | null {
  const bit = parseMask(def, raw ?? null);
  return bit === 0 ? null : optionByBit(def, bit);
}

/** Parse a gang-scope perk stat. Accepts the JSON string Gangs returns, or an already-parsed object. */
export function parseGangData(def: EnumPerkDef, raw: StatValue | undefined): GangPerkData | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  const field = (k: string): StatValue => {
    const x = o[k] ?? o[k.toLowerCase()];
    return typeof x === "number" || typeof x === "string" ? x : null;
  };
  return { Unlocked: parseMask(def, field("Unlocked")), Equipped: parseMask(def, field("Equipped")) };
}

export function encodeGangData(data: GangPerkData): string {
  return JSON.stringify({ Unlocked: data.Unlocked, Equipped: data.Equipped });
}

// ── command input ───────────────────────────────────────────────────────────────────────────────

/**
 * Resolve command arguments to an option, like the C# commands: a non-negative integer is the
 * enum value (it must be exactly one option's bit here), otherwise the words are joined with
 * `_` and matched against the enum names (`!wardenicon kata smile`).
 */
export function findOption(def: EnumPerkDef, args: string[]): PerkOption | null {
  if (args.length === 0) return null;
  const first = args[0].trim();
  if (/^\d+$/.test(first)) return optionByBit(def, Number(first));
  return optionByName(def, args.join("_"));
}

/** What a buy/equip request turns into. */
export type Decision =
  | { kind: "buy"; cost: number; equip: boolean }
  | { kind: "equip" }
  | { kind: "already" }
  | { kind: "no_purchase_perm" }
  | { kind: "no_manage_perm" };

export interface DecideInput {
  /** The gang's unlocked mask (already including free options). */
  unlocked: number;
  /** Currently equipped bit (player or gang, by the perk's scope); 0 = none. */
  equipped: number;
  canPurchase: boolean;
  canManage: boolean;
}

/**
 * The C# command flow. A locked option is bought (needs PURCHASE_PERKS); a gang-scope purchase
 * also equips it. An unlocked option is equipped: per-player perks need no permission; a
 * gang-scope perk needs MANAGE_PERKS and is a silent no-op if it is already equipped.
 */
export function decide(def: EnumPerkDef, opt: PerkOption, input: DecideInput): Decision {
  if (!isUnlocked(input.unlocked, opt)) {
    if (!input.canPurchase) return { kind: "no_purchase_perm" };
    return { kind: "buy", cost: opt.cost, equip: def.equip === "gang" };
  }
  if (def.equip === "player") return { kind: "equip" };
  if (input.equipped === opt.bit) return { kind: "already" };
  if (!input.canManage) return { kind: "no_manage_perm" };
  return { kind: "equip" };
}

// ── menu ────────────────────────────────────────────────────────────────────────────────────────

export type MenuState = "equipped" | "unlocked" | "locked";

/**
 * The C# `AbstractEnumMenu.compare` order: the equipped option first, then unlocked options by
 * price, then locked options by price (ties keep enum order).
 */
export function menuOrder(def: EnumPerkDef, unlocked: number, equipped: number): Array<{ opt: PerkOption; state: MenuState }> {
  const rank = (o: PerkOption): number => (o.bit === equipped ? 0 : isUnlocked(unlocked, o) ? 1 : 2);
  return def.options
    .map((opt, i) => ({ opt, i }))
    .sort((a, b) => rank(a.opt) - rank(b.opt) || a.opt.cost - b.opt.cost || a.i - b.i)
    .map(({ opt }) => ({
      opt,
      state: (opt.bit === equipped ? "equipped" : isUnlocked(unlocked, opt) ? "unlocked" : "locked") as MenuState,
    }));
}

// ── resolution (what a transform applies) ──────────────────────────────────────────────────────

/** Uniform pick, or null from an empty list. */
export function pickRandom<T>(items: T[], rand: Rand): T | null {
  if (items.length === 0) return null;
  const i = Math.min(items.length - 1, Math.floor(rand() * items.length));
  return items[i];
}

/** Concrete colours the gang has unlocked (the C# `PickRandom` candidates: options with a colour). */
function unlockedColors(def: EnumPerkDef, unlocked: number): PerkOption[] {
  return def.options.filter((o) => o.kind === "value" && isUnlocked(unlocked, o));
}

/**
 * Per-player icon (WardenIcon/SpecialIcon — the C# `WardenIconBehavior.getIcon`): nothing
 * equipped or the gang no longer owns it → default (null); RANDOM → a random unlocked non-random
 * option (which may be DEFAULT); otherwise the option. A null or DEFAULT result means "leave
 * the producer's default icon alone".
 */
export function resolveIcon(def: EnumPerkDef, unlocked: number, equipped: PerkOption | null, rand: Rand): PerkOption | null {
  if (!equipped || (unlocked & equipped.bit) === 0) return null;
  if (equipped.kind !== "random") return equipped;
  const pool = def.options.filter((o) => o.kind !== "random" && isUnlocked(unlocked, o));
  return pickRandom(pool, rand);
}

/**
 * Per-player colour (paint, LR): DEFAULT/unset/not owned → null (no change); RANDOM → a random
 * unlocked concrete colour (null if none); RAINBOW/colour → itself.
 */
export function resolveColor(def: EnumPerkDef, unlocked: number, equipped: PerkOption | null, rand: Rand): PerkOption | null {
  if (!equipped || (unlocked & equipped.bit) === 0) return null;
  if (equipped.kind === "default") return null;
  if (equipped.kind === "random") return pickRandom(unlockedColors(def, unlocked), rand);
  return equipped;
}

/**
 * Gang special-day colour (C# `SpecialDayManager.assignGangColors`:
 * `data.Equipped.GetColor() ?? data.Unlocked.PickRandom()`): a colour or RAINBOW applies as is;
 * DEFAULT, RANDOM or unset picks a random unlocked colour (null if the gang owns none).
 */
export function resolveGangColor(def: EnumPerkDef, data: GangPerkData | null, rand: Rand): PerkOption | null {
  if (!data) return null;
  const eq = optionByBit(def, data.Equipped);
  if (eq && (eq.kind === "value" || eq.kind === "rainbow")) return eq;
  return pickRandom(unlockedColors(def, data.Unlocked), rand);
}

/** Gang bomb icon (C# `C4Behavior`): the equipped icon, or null for none/DEFAULT. */
export function resolveGangIcon(def: EnumPerkDef, data: GangPerkData | null): PerkOption | null {
  if (!data) return null;
  const eq = optionByBit(def, data.Equipped);
  return eq && eq.kind === "value" ? eq : null;
}

// ── permissions ────────────────────────────────────────────────────────────────────────────────

/** `@edgegamers/gangs` permission bits used here (contracts cannot export constants). */
export const Perm = {
  PURCHASE_PERKS: 1 << 6,
  MANAGE_PERKS: 1 << 7,
  ADMINISTRATOR: 1 << 10,
  OWNER: 1 << 11,
} as const;

/**
 * The lowest rank that holds `perm` (the C# `CheckRank` "minRank" shown in the no-permission
 * message). `ranks` are owner-first; a rank with ADMINISTRATOR/OWNER counts as holding it.
 */
export function minRankName(ranks: Array<{ rank: number; name: string; permissions: number }>, perm: number): string {
  const holds = (p: number): boolean => (p & perm) === perm || (p & (Perm.ADMINISTRATOR | Perm.OWNER)) !== 0;
  let best: { rank: number; name: string } | null = null;
  for (const r of ranks) if (holds(r.permissions) && (best === null || r.rank > best.rank)) best = r;
  return best?.name ?? ranks[0]?.name ?? "Owner";
}
