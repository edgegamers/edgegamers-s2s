# @edgegamers/jailbreak-gangperks

The only bridge between Gangs (`@edgegamers/gangs`) and Jailbreak. It owns the six Jailbreak gang perks
(warden icon, ST icon, warden paint colour, LR colour, special-day colour, bomb icon), the
Jailbreak gang stats (LR, last guard, warden) and the Jailbreak credit rewards. Remove it and
Jailbreak runs unchanged; remove Jailbreak and it only registers its perks.

Ported from `mod/Gangs.BaseImpl`, `mod/Gangs.*Perk` and the Gangs calls that used to live inside
`Jailbreak.LastRequest`, `Jailbreak.LastGuard`, `Jailbreak.Warden`, `Jailbreak.Rebel` and
`Jailbreak.SpecialDay`.

## Files

| File | What |
| --- | --- |
| `src/plugin.ts` | wiring: Gangs handle, perk registration, commands, optional-plugin watches |
| `src/perks.ts` | the six perks as data (STAT_IDs, enum options/bits, glyphs, colours, prices) — pure |
| `src/enum-perk.ts` | the generic enum-perk engine: bitmask math, stat parsing, buy/equip decision, menu order, random/rainbow resolution — pure |
| `src/records.ts` | stat records (C# JSON shape), credit amounts, rebel weapon scores, LR-colour conflict rule — pure |
| `src/commands.ts` | the one buy/equip command flow used by all six perk commands |
| `src/menus.ts` | the perk menu |
| `src/bridges.ts` | Transform handlers (icons, colours, bomb icon) and the special-day gang tint |
| `src/stats.ts` | stat + credit handlers (Jailbreak forwards, `player_hurt`, `player_death`) |
| `src/messages.ts` | every player-facing string |

## Commands

| Command | Who | What |
| --- | --- | --- |
| `sm_wardenicon` / `!wardenicon [icon]` | gang members | Menu / buy (gang) / equip (you) the icon shown above you as warden |
| `sm_sticon` / `!sticon [icon]` | gang members | Same for the special-treatment icon |
| `sm_paint` / `!paint [color]` | gang members | Same for your warden paint colour (incl. Random, Rainbow) |
| `sm_lrcolor` / `!lrcolor [color]` | gang members | Same for your LR colour (both LR players are tinted) |
| `sm_sdcolor` / `!sdcolor [color]` | gang members | Menu / buy / set the gang's special-day colour (gang-wide) |
| `sm_bombicon` / `!bombicon [icon]` | gang members | Menu / buy / set the gang's C4 kill-feed icon (gang-wide) |
| `sm_jbstats` / `!jbstats` | anyone | Your Jailbreak stats (LRs, LR wins, LRs reached, last guards, warden stats) |

Options are typed by enum name (`!wardenicon kata smile`, `!paint rainbow`) or enum value
(`!wardenicon 32`). Buying needs the gang rank permission `PURCHASE_PERKS`; it is charged from the
gang bank first, then the wallet (`tryPurchase(..., excludeGang=false)`), and announced in gang chat.
Changing a gang-wide perk (`!sdcolor`, `!bombicon`) needs `MANAGE_PERKS`. Every perk is also listed
in Gangs' perk menu (registered as a custom perk whose `command` is the one above).

## Config (`s2script.config`)

| Key | Default | C# | Meaning |
| --- | --- | --- | --- |
| `min_players_for_credits` | 5 | `css_edgegamers_jailbreak-min_players_for_credits` | Connected players needed before LR reached/won, guard/warden kill, rebel kill and C4 kills pay credits |

## Contracts used

- **`@edgegamers/gangs` (hard)** — `isReady`/`OnReady`, `getGangOf`, `getGangStat`/`setGangStat`,
  `getPlayerStat`/`setPlayerStat`, `hasPermission`, `getRanks`, `tryPurchase`, `getBalance`,
  `getGangBalance`, `grantPlayer`, `registerPerk`, `sendGangChat`. Perks are registered on
  `OnReady` and right after load if Gangs is already ready.
- **`@edgegamers/jailbreak-warden` (optional)** — `OnWardenIcon`, `OnSpecialIcon`, `OnPaintColor` (Transforms);
  `OnWardenAssigned`, `OnWardenRemoved` (warden stats).
- **`@edgegamers/jailbreak-lastrequest` (optional)** — `OnLRColor` (Transform); `OnLREnabled`, `OnLRStart`,
  `OnLREnd`, `OnLastGuardStart`, `OnLastGuardEnd`; `isInLR` (rebel weapon scoring).
- **`@edgegamers/jailbreak-specialdays` (optional)** — `OnSpecialDayStart`/`OnSpecialDayEnd` (gang tint); `isRunning`.
- **`@edgegamers/jailbreak-core` (optional, `^1.1.0`)** — `OnBombIcon` (Transform), `OnRebelChanged`, `OnRoundStart`,
  `OnBombDetonated` (C4 kill credits); `isRebel`.

Publishes nothing. Every handler is synchronous, reads Gangs' cache directly and returns
`{ result: Continue }` when nothing applies.

### Stored data (same ids and shapes as the C#)

| Stat id | Scope | Value |
| --- | --- | --- |
| `jb_wardenicon`, `jb_specialicon`, `jb_wardenpaintcolor`, `jb_lr_color` | gang | unlocked bitmask (number) |
| same ids | player | equipped option (the enum value, number) |
| `jb_sd_color`, `jb_bomb_icon` | gang | JSON string `{"Unlocked":mask,"Equipped":value}` |
| `jb_lr_stat` | player | JSON `{LRsReachedAsCt, LRsReachedAsT, CtLrs, TLrs, CTLrsWon, TLrsWon}` |
| `jb_lg_stat` | player | JSON `{CtLgs, TLgs}` |
| `jb_warden_stat` | player | JSON `{TimesWardened, WardenDeaths, WardensKilled, GuardDeathsAsWarden, WardenDeathsAsGuard}` |

Flags written by a string-enum serializer (`"KING, QUEEN"`) are read too.

## Live-test checklist

Nothing here has run on a real server yet. With Gangs + all five JB plugins loaded:

- [ ] Server log: no `Gangs refused perk` lines; `!gang` → perks lists the six perks; picking one opens its menu.
- [ ] `!wardenicon` outside a gang → "not in a gang"; in a gang → menu with Default (Equipped/Unlocked) first, locked icons with prices.
- [ ] Buy an icon with a rank lacking `PURCHASE_PERKS` → "must be at least <rank>"; with too few credits → cannot-afford line, nothing charged.
- [ ] Buy `KING`: credits drop (gang bank first), gang chat announces it; `!wardenicon king` then equips it ("Set your Warden Icon to ♔ (King).").
- [ ] Take warden: the icon above your head is ♔; with `RANDOM` equipped it changes between wardenships among the gang's owned icons.
- [ ] Leave the gang: warden icon falls back to the default.
- [ ] `!sticon` + special treatment: ST icon patched the same way.
- [ ] `!paint red` then paint as warden → red; `rainbow` → rainbow; `random` → one of the gang's colours.
- [ ] `!lrcolor blue`, start an LR: both players tinted blue and both get "Your LR will be Blue."; with two gangs the richer gang's member wins.
- [ ] `!sdcolor green` (needs `MANAGE_PERKS` to switch between owned colours): on a special day every online gang member is green with the chat line; `rainbow` cycles every frame and stops at day end (players reset to white).
- [ ] `!bombicon doge`: a jihad C4 kill shows the `doge` kill-feed icon (requires the icon in the server's resource pack); `default` keeps core's icon.
- [ ] Stats: become warden, die as warden, kill a warden, play an LR (win and lose), reach last guard; `!jbstats` reflects each, and the rows are JSON under the C# ids.
- [ ] Credits (≥ `min_players_for_credits` players): LR reached 65 T / 60 CT; LR win 35 CT / 20 T; guard kill 15, warden kill 35 (not on special days); last-guard kill 40; rebel kill 30/25/15/10 by weapon used on guards (5, or 2 during last guard, if none). Each prints "You earned N credits (reason)".
- [ ] C4 kills (≥ `min_players_for_credits` players): a jihad C4 killing 2 guards pays the bomber 50 ("You earned 50 credits (C4 Kill)") on top of the per-guard kill credits; 0 kills pays nothing; below the player minimum pays nothing.
- [ ] Hot-reload `@edgegamers/jailbreak-warden` / `@edgegamers/jailbreak-lastrequest` / `@edgegamers/jailbreak-specialdays` / `@edgegamers/jailbreak-core`: perks keep working after the reload (watchOptional re-attaches).
- [ ] Reload Gangs: perks are re-registered on its `OnReady`.

## Port notes

**Simplified**
- The C# had a perk class, command class, menu class and bootstrap per perk (on top of
  `BasePerk`/`AbstractEnumCommand`/`AbstractEnumMenu`/`BasicPerkMenu`). Here they are six rows of
  data in `perks.ts` driving one engine (`enum-perk.ts`), one command flow and one menu.
- Free options (every `DEFAULT`, cost 0) count as always unlocked instead of needing a 0-credit
  "purchase" first.
- Numeric arguments must be exactly one option's enum value; the C# cast any integer to the enum,
  which allowed combined/undefined values (and a fallback price).
- Option names in menus are "Lower Default", not the C# "Lower_default"; the LR colour DEFAULT
  shows as "Default" (the C# showed "Random").
- Gang chat wording (`PERK_PURCHASED`, `GANG_THING_SET`) and the error lines came from the Gangs
  localizer, which is not in this repo; the English here is equivalent, not verbatim.

**Behaviour fixes (C# bugs, ported as intended)**
- LR colours: the C# `colorForLR` never set its `toApply` variable, so the perk never applied.
  Here the higher-ranked participant's equipped colour (if their gang owns it) tints the pair;
  RANDOM picks from the gang's owned colours (the C# read the player stat by mistake).
- Random colours never pick Rainbow (the C# random pool included Rainbow as plain white).
- Special-day colours: the C# loop `return`ed at the first non-gang player, skipping everyone
  after them; here each gang member is handled. A "random" gang gets one colour for the whole gang.
  As in the C#, a gang whose equipped SD colour is Default/Random gets a random owned colour.
- Warden stats: `WardenDeaths` counted every non-pass removal (fire, disconnect, round end); now
  only `death`. On a guard's death the C# credited `GuardDeathsAsWarden`/`WardenDeathsAsGuard` to
  the wrong people; now when the warden dies every other guard gets `WardenDeathsAsGuard`, and when
  a guard dies the warden gets `GuardDeathsAsWarden`.

**Kept quirks** — LR stats count `TLrs`/`CtLrs` both when LR is enabled (every living player) and
when an LR starts (both participants), and `LRsReached*` only when credits are paid, exactly as the
C#.

**Approximations**
- LR colour conflicts were resolved by Gangs leaderboard position; `@edgegamers/gangs` has no
  leaderboard, so the gang with the larger bank balance wins (same gang / ties → prisoner).
- Gangs' stat registry (`IStatManager.Stats.Add`) let Gangs display these stats; `@edgegamers/gangs` has
  no stat registry, so `!jbstats` shows them instead.
- The C# Gangs `eco.Grant` printed its own line; `grantPlayer` is silent, so this plugin prints
  "You earned N credits (reason)".
- Warden/rebel/last-guard status at death is tracked from `OnWardenRemoved`/`OnRebelChanged`/
  `OnLastGuardEnd` (a "death" removal, or last guard ending, within 1 s still counts) because the
  producers may clear it before our `player_death` handler runs — e.g. killing the last guard ends
  last guard in `@edgegamers/jailbreak-lastrequest`'s handler, and that kill is the "LG Kill" (40).

**Not ported**
- `Gangs.CellsPerk` — commented out in the C# bootstrap (`mod/Gangs.Boostrap/GangsServiceExtension.cs`).

**C4 kill credits** — `C4Behavior` paid the bomber `killed * 25` ("C4 Kill") after a detonation.
Here core's `OnBombDetonated { player, killed }` pays the same amount (bomber resolved by userId,
since they are already dead). Unlike the C#, it is gated by `min_players_for_credits` like every
other Jailbreak credit here. The guards a C4 kills still also pay the usual guard/warden-kill
credits through `player_death` (core credits the bomber as attacker), as in the C#.
