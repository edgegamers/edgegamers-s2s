/**
 * The perk effects: Jailbreak Transform forwards patched from cached gang data, and the
 * special-day gang tint. Every handler is synchronous, reads Gangs' cache directly, and never
 * throws (`guard`) — anything that does not apply returns Continue.
 */
import { Chat, HookResult } from "@s2script/sdk";
import { Player } from "@s2script/cs2";
import { rainbow, setPawnColor, parseColor, Colors, isSteamId64 } from "@edgegamers/jailbreak-shared";
import type { IconRequest, PaintColorRequest } from "@edgegamers/jailbreak-warden";
import type { LRColorRequest } from "@edgegamers/jailbreak-lastrequest";
import type { BombIconRequest } from "@edgegamers/jailbreak-core";
import type { SDStartEvent } from "@edgegamers/jailbreak-specialdays";
import type { EnumPerkDef, PerkOption } from "./perks.ts";
import { BOMB_ICON, LR_COLOR, PAINT_COLOR, SD_COLOR, SPECIAL_ICON, WARDEN_ICON } from "./perks.ts";
import {
  parseEquipped,
  parseGangData,
  parseMask,
  resolveColor,
  resolveGangColor,
  resolveGangIcon,
  resolveIcon,
  unlockedMask,
} from "./enum-perk.ts";
import { higherPlayer } from "./records.ts";
import { msgFor } from "./messages.ts";
import { guard, readyGangs } from "./state.ts";

const rand = (): number => Math.random();

type Unchanged = { result: typeof HookResult.Continue };
const CONTINUE: Unchanged = { result: HookResult.Continue };

/** A per-player perk's resolved option for `steamId` (null = nothing applies). */
function playerOption(def: EnumPerkDef, steamId: string): PerkOption | null {
  const gangs = readyGangs();
  if (!gangs) return null;
  const gang = gangs.getGangOf(steamId);
  if (!gang) return null;
  const unlocked = unlockedMask(def, parseMask(def, gangs.getGangStat(gang.id, def.statId)));
  const equipped = parseEquipped(def, gangs.getPlayerStat(steamId, def.statId));
  return def.resolve === "icon" ? resolveIcon(def, unlocked, equipped, rand) : resolveColor(def, unlocked, equipped, rand);
}

function iconPatch(def: EnumPerkDef, req: IconRequest): { result: typeof HookResult.Changed; patch: { icon: string } } | Unchanged {
  return guard(`${def.statId} transform`, CONTINUE, () => {
    const opt = playerOption(def, req.player.steamId);
    if (!opt || opt.kind === "default" || opt.value === req.icon) return CONTINUE;
    return { result: HookResult.Changed, patch: { icon: opt.value } };
  });
}

/** @edgegamers/jailbreak-warden OnWardenIcon — Gangs.WardenIconPerk. */
export function onWardenIcon(req: IconRequest): ReturnType<typeof iconPatch> {
  return iconPatch(WARDEN_ICON, req);
}

/** @edgegamers/jailbreak-warden OnSpecialIcon — Gangs.SpecialIconPerk. */
export function onSpecialIcon(req: IconRequest): ReturnType<typeof iconPatch> {
  return iconPatch(SPECIAL_ICON, req);
}

/** @edgegamers/jailbreak-warden OnPaintColor — Gangs.WardenPaintColorPerk. */
export function onPaintColor(
  req: PaintColorRequest,
): { result: typeof HookResult.Changed; patch: { color: string } } | Unchanged {
  return guard("paint colour transform", CONTINUE, () => {
    const opt = playerOption(PAINT_COLOR, req.player.steamId);
    if (!opt || opt.value === "" || opt.value === req.color) return CONTINUE;
    return { result: HookResult.Changed, patch: { color: opt.value } };
  });
}

/** When each LR pair was last told its colour (the transform may be asked more than once). */
const lrAnnounced = new Map<string, number>();
const LR_ANNOUNCE_DEDUPE_MS = 10_000;

/**
 * @edgegamers/jailbreak-lastrequest OnLRColor — Gangs.LastRequestColorPerk (LastRequestManager.colorForLR): the
 * higher-ranked participant's equipped LR colour, if their gang owns it, tints both players.
 */
export function onLRColor(req: LRColorRequest): { result: typeof HookResult.Changed; patch: { color: string } } | Unchanged {
  return guard("LR colour transform", CONTINUE, () => {
    const gangs = readyGangs();
    if (!gangs) return CONTINUE;
    const info = (steamId: string): { gangId: number | null; gangScore: number | null } => {
      const g = gangs.getGangOf(steamId);
      return g ? { gangId: g.id, gangScore: gangs.getGangBalance(g.id) } : { gangId: null, gangScore: null };
    };
    const pick = higherPlayer(info(req.prisoner.steamId), info(req.guard.steamId));
    const higher = pick === "a" ? req.prisoner : req.guard;
    const opt = playerOption(LR_COLOR, higher.steamId);
    if (!opt || opt.value === "") return CONTINUE;

    const key = `${req.prisoner.userId}:${req.guard.userId}`;
    const now = Date.now();
    if ((lrAnnounced.get(key) ?? 0) + LR_ANNOUNCE_DEDUPE_MS < now) {
      lrAnnounced.set(key, now);
      for (const p of [req.prisoner, req.guard]) {
        const pl = Player.fromUserId(p.userId);
        if (pl) Chat.toSlot(pl.slot, msgFor(pl.slot).lrColor(LR_COLOR,opt));
      }
    }
    if (opt.value === req.color) return CONTINUE;
    return { result: HookResult.Changed, patch: { color: opt.value } };
  });
}

/** @edgegamers/jailbreak-core OnBombIcon — Gangs.BombIconPerk (the gang's equipped kill-feed icon). */
export function onBombIcon(req: BombIconRequest): { result: typeof HookResult.Changed; patch: { icon: string } } | Unchanged {
  return guard("bomb icon transform", CONTINUE, () => {
    const gangs = readyGangs();
    if (!gangs) return CONTINUE;
    const gang = gangs.getGangOf(req.player.steamId);
    if (!gang) return CONTINUE;
    const opt = resolveGangIcon(BOMB_ICON, parseGangData(BOMB_ICON, gangs.getGangStat(gang.id, BOMB_ICON.statId)));
    if (!opt || opt.value === req.icon) return CONTINUE;
    return { result: HookResult.Changed, patch: { icon: opt.value } };
  });
}

// ── special-day gang colours ────────────────────────────────────────────────────────────────────

/** userIds tinted this special day; true = rainbow (re-tinted every frame). */
const sdTinted = new Map<number, boolean>();

/**
 * @edgegamers/jailbreak-specialdays OnSpecialDayStart — Gangs.SpecialDayColorPerk (SpecialDayManager.assignGangColors):
 * every connected gang member is tinted with the gang's SD colour for the day and told so.
 */
export function onSpecialDayStart(_ev: SDStartEvent): void {
  guard("special-day colours", undefined, () => {
    clearSpecialDayColors(false);
    const gangs = readyGangs();
    if (!gangs) return;
    const perGang = new Map<number, PerkOption | null>();
    for (const p of Player.all()) {
      if (!isSteamId64(p.steamId)) continue;
      const gang = gangs.getGangOf(p.steamId);
      if (!gang) continue;
      // One resolution per gang, so a "random" gang is one colour, not one per member.
      if (!perGang.has(gang.id)) {
        perGang.set(gang.id, resolveGangColor(SD_COLOR, parseGangData(SD_COLOR, gangs.getGangStat(gang.id, SD_COLOR.statId)), rand));
      }
      const opt = perGang.get(gang.id) ?? null;
      if (!opt) continue;
      if (opt.kind === "rainbow") {
        sdTinted.set(p.userId, true);
      } else {
        const c = parseColor(opt.value);
        if (c && c !== "rainbow") setPawnColor(p.pawn, c);
        sdTinted.set(p.userId, false);
      }
      Chat.toSlot(p.slot, msgFor(p.slot).sdColor(SD_COLOR, opt));
    }
  });
}

/** Per-frame: keep rainbow gang members cycling. Cheap no-op when nobody is rainbow. */
export function tickSpecialDayRainbow(): void {
  if (sdTinted.size === 0) return;
  const c = rainbow(Date.now());
  for (const [userId, isRainbow] of sdTinted) {
    if (!isRainbow) continue;
    const p = Player.fromUserId(userId);
    if (p) setPawnColor(p.pawn, c);
  }
}

/** End of the day (or round/map change): stop rainbows and, if `reset`, restore white. */
export function clearSpecialDayColors(reset: boolean): void {
  if (reset) {
    for (const userId of sdTinted.keys()) {
      const p = Player.fromUserId(userId);
      if (p) setPawnColor(p.pawn, Colors.White);
    }
  }
  sdTinted.clear();
}

/** Forget per-map bookkeeping. */
export function resetBridges(): void {
  sdTinted.clear();
  lrAnnounced.clear();
}
