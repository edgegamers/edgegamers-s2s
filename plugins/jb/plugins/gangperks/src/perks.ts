/**
 * The six Jailbreak gang perks as data. Every perk is the same "enum perk" (see `enum-perk.ts`):
 * a list of options, each a bit in a flags enum, with a price. The gang unlocks options with
 * credits (a bitmask stored as a gang stat under the perk's STAT_ID); the equipped option is a
 * player stat (`equip: "player"`) or part of the gang stat (`equip: "gang"`).
 *
 * STAT_IDs, enum names, bit values, glyphs, colours and prices are copied from the C#
 * (`mod/Gangs.*Perk/*.cs`). Pure data — no SDK imports, so it is unit-tested directly.
 *
 * Not ported: `Gangs.CellsPerk` — it is commented out in the C# bootstrap
 * (`mod/Gangs.Boostrap/GangsServiceExtension.cs`), so it never shipped.
 */

/** How an option behaves when resolved. */
export type OptionKind = "default" | "random" | "rainbow" | "value";

/** A chat tint for colour options (mapped to a chat colour byte in `messages.ts`). */
export type Tint = "Red" | "Orange" | "Yellow" | "Green" | "Cyan" | "Blue" | "Purple" | "White";

export interface PerkOption {
  /** The C# enum member name, e.g. `"LOWER_DEFAULT"`. Players can type it (`!wardenicon star`). */
  name: string;
  /** The C# enum value (a single bit). */
  bit: number;
  /** Price to unlock, in credits. 0 = free (always unlocked). */
  cost: number;
  kind: OptionKind;
  /** What the option applies: an icon glyph, a `"#rrggbb"` colour, or a kill-feed icon name. */
  value: string;
  /** Plain display label (menus, purchase reasons). */
  label: string;
  /** Colour options: the chat tint used when the option is named in chat. */
  tint?: Tint;
}

export interface EnumPerkDef {
  /** The C# STAT_ID — also the perk id registered with Gangs. */
  statId: string;
  /** Perk name listed by Gangs, e.g. "Warden Icon". */
  name: string;
  /** Title used in menus and chat, e.g. "Warden Icon", "ST Icon". */
  title: string;
  description: string;
  /** The chat/console command that opens the perk (`sm_wardenicon` → `!wardenicon`). */
  command: string;
  /**
   * "player": the gang stat is the unlocked bitmask (a number) and each member equips their own
   * option (player stat, the option's bit). "gang": the gang stat is a JSON string
   * `{"Unlocked":mask,"Equipped":bit}` — one option for the whole gang, changing it needs the
   * MANAGE_PERKS permission, and buying an option also equips it.
   */
  equip: "player" | "gang";
  /** What resolves an equipped option: an icon (random may yield the default) or a colour. */
  resolve: "icon" | "color" | "gang-color" | "gang-icon";
  options: PerkOption[];
}

/** `"LOWER_DEFAULT"` → `"Lower Default"` (the C# `ToTitleCase`, with `_` read as a space). */
export function titleCase(enumName: string): string {
  return enumName
    .split(/[_ ]+/)
    .filter((w) => w.length > 0)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

// ── colours (System.Drawing.Color values, which the C# used) ─────────────────────────────────
const NET_COLORS: Record<Tint, string> = {
  Red: "#ff0000",
  Orange: "#ffa500",
  Yellow: "#ffff00",
  Green: "#008000",
  Cyan: "#00ffff",
  Blue: "#0000ff",
  Purple: "#800080",
  White: "#ffffff",
};

/** `ColorExtensions.GetColorMultiplier` (null = the random option). */
const COLOR_MULTIPLIER: Record<Tint, number> = {
  Red: 3,
  Orange: 1.5,
  Yellow: 1.25,
  Green: 1,
  Cyan: 2.5,
  Blue: 2,
  Purple: 2.25,
  White: 1,
};
const RANDOM_MULTIPLIER = 5;
const RAINBOW_MULTIPLIER = 10;

/**
 * Build a colour perk's options from the C# enum order. Prices follow the C# `GetCost`:
 * DEFAULT is free, RAINBOW is 10 × base, RANDOM (no colour) 5 × base, a colour multiplier × base.
 */
function colorOptions(members: string[], base: number): PerkOption[] {
  return members.map((name, i): PerkOption => {
    const bit = 1 << i;
    if (name === "DEFAULT") return { name, bit, cost: 0, kind: "default", value: "", label: "Default" };
    if (name === "RANDOM") {
      return { name, bit, cost: Math.round(RANDOM_MULTIPLIER * base), kind: "random", value: "", label: "Random" };
    }
    if (name === "RAINBOW") {
      return { name, bit, cost: RAINBOW_MULTIPLIER * base, kind: "rainbow", value: "rainbow", label: "Rainbow" };
    }
    const tint = titleCase(name) as Tint;
    return {
      name,
      bit,
      cost: Math.round(COLOR_MULTIPLIER[tint] * base),
      kind: "value",
      value: NET_COLORS[tint],
      label: tint,
      tint,
    };
  });
}

/** Build an icon perk's options from `[name, glyph, cost]` rows in C# enum order. */
function iconOptions(rows: Array<[string, string, number]>): PerkOption[] {
  return rows.map(([name, glyph, cost], i): PerkOption => {
    const kind: OptionKind = name === "DEFAULT" ? "default" : name === "RANDOM" ? "random" : "value";
    return { name, bit: 1 << i, cost, kind, value: glyph, label: `${glyph} (${titleCase(name)})` };
  });
}

// ── Gangs.WardenIconPerk ───────────────────────────────────────────────────────────────────────
export const WARDEN_ICON: EnumPerkDef = {
  statId: "jb_wardenicon",
  name: "Warden Icon",
  title: "Warden Icon",
  description: "Change the icon that appears above your head as warden",
  command: "sm_wardenicon",
  equip: "player",
  resolve: "icon",
  options: iconOptions([
    ["DEFAULT", "W", 0],
    ["LOWER_DEFAULT", "w", 1500],
    ["KATA_SMILE", "ツ", 4000],
    ["DOWN_ARROW", "↓", 3500],
    ["STAR", "★", 6500],
    ["KING", "♔", 7000],
    ["QUEEN", "♕", 6500],
    ["ROOK", "♖", 5000],
    ["BISHOP", "♗", 2500],
    ["KNIGHT", "♘", 3000],
    ["PAWN", "♙", 4000],
    ["RANDOM", "?", 10000],
  ]),
};

// ── Gangs.SpecialIconPerk ──────────────────────────────────────────────────────────────────────
export const SPECIAL_ICON: EnumPerkDef = {
  statId: "jb_specialicon",
  name: "ST Icon",
  title: "ST Icon",
  description: "Change the icon that appears above your head as ST",
  command: "sm_sticon",
  equip: "player",
  resolve: "icon",
  options: iconOptions([
    ["DEFAULT", "S", 0],
    ["LOWER_DEFAULT", "s", 1250],
    ["CIRCLE", "⬤", 1000],
    ["SQUARE", "■", 1200],
    ["TRIANGLE", "▲", 1300],
    ["ASTERISK", "✸", 4000],
    ["DIAMOND", "♦", 3000],
    ["HEART", "♥", 3000],
    ["CLUB", "♣", 3000],
    ["SPADE", "♠", 2500],
    ["RANDOM", "?", 10000],
  ]),
};

// ── Gangs.WardenPaintColorPerk ─────────────────────────────────────────────────────────────────
export const PAINT_COLOR: EnumPerkDef = {
  statId: "jb_wardenpaintcolor",
  name: "Paint Color",
  title: "Paint Color",
  description: "Change the color of your warden paint!",
  command: "sm_paint",
  equip: "player",
  resolve: "color",
  options: colorOptions(
    ["DEFAULT", "RED", "ORANGE", "YELLOW", "GREEN", "CYAN", "BLUE", "PURPLE", "RANDOM", "RAINBOW"],
    7500,
  ),
};

// ── Gangs.LastRequestColorPerk ─────────────────────────────────────────────────────────────────
export const LR_COLOR: EnumPerkDef = {
  statId: "jb_lr_color",
  name: "LR Colors",
  title: "LR Color",
  description:
    "Pick the color of you and your partner during your LRs. Conflicting colors are resolved by gang rank",
  command: "sm_lrcolor",
  equip: "player",
  resolve: "color",
  options: colorOptions(
    ["ORANGE", "YELLOW", "GREEN", "CYAN", "BLUE", "PURPLE", "DEFAULT", "RANDOM", "RAINBOW"],
    8000,
  ),
};

// ── Gangs.SpecialDayColorPerk ──────────────────────────────────────────────────────────────────
export const SD_COLOR: EnumPerkDef = {
  statId: "jb_sd_color",
  name: "Special Day Color",
  title: "SD Color",
  description: "Change the color of your gang during special days!",
  command: "sm_sdcolor",
  equip: "gang",
  resolve: "gang-color",
  options: colorOptions(
    ["RED", "ORANGE", "YELLOW", "GREEN", "CYAN", "BLUE", "PURPLE", "DEFAULT", "RANDOM", "RAINBOW"],
    5000,
  ),
};

// ── Gangs.BombIconPerk ─────────────────────────────────────────────────────────────────────────
const BOMB_ROWS: Array<[string, number]> = [
  ["ANYASMUG", 1750],
  ["C4_RED", 2000],
  ["CACHINGA", 25000],
  ["CLOWN_EMOJI", 15000],
  ["CSGO", 3500],
  ["DOGE", 12500],
  ["DOLLAR", 100000],
  ["EGO", 7500],
  ["GOAT", 20000],
  ["IM", 10000],
  ["IMBAD", 12500],
  ["KZ", 10000],
  ["OMEGALUL", 25000],
  ["PEPEGA", 20000],
  ["POOP", 5000],
  ["STEAM", 2500],
  ["THINKING", 7500],
  ["UWUNUKE", 5000],
  ["ZZZ", 10000],
  ["DEFAULT", 0],
];

export const BOMB_ICON: EnumPerkDef = {
  statId: "jb_bomb_icon",
  name: "Bomb Icon",
  title: "Bomb Icon",
  description: "Customize the icon that is shown when you bomb a CT",
  command: "sm_bombicon",
  equip: "gang",
  resolve: "gang-icon",
  options: BOMB_ROWS.map(([name, cost], i): PerkOption => ({
    name,
    bit: 1 << i,
    cost,
    kind: name === "DEFAULT" ? "default" : "value",
    // C# `GetEquipment`: the lower-cased enum name is the kill-feed icon.
    value: name.toLowerCase(),
    label: titleCase(name),
  })),
};

/** Every perk this plugin registers with Gangs, in registration order. */
export const ALL_PERKS: EnumPerkDef[] = [BOMB_ICON, SD_COLOR, LR_COLOR, WARDEN_ICON, SPECIAL_ICON, PAINT_COLOR];
