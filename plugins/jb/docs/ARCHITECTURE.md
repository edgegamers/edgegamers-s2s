# Jailbreak on s2script — architecture

This repository ports [edgegamers/Jailbreak](https://github.com/edgegamers/Jailbreak) (CounterStrikeSharp,
~20k lines of C# across 28 projects) to [s2script](https://github.com/s2script/s2script) SDK 0.27
(host API 3, interop protocol 2).

The old repo split one plugin into dozens of projects wired together by dependency injection,
with every module reaching into every other module's services (and into Gangs' database
directly). Here the game mode is **seven plugins and one shared library**, each owning one area of
the game, talking only through small typed contracts.

## The plugins

| Plugin | Owns | Ported from |
| --- | --- | --- |
| `@edgegamers/jailbreak-core` | round number/phase, the round **mode** (normal / LR / last guard / special day), rebels + C4 jihad bomb, cell opening, the round log (`!logs`), admin debug commands | `Jailbreak`, `Jailbreak.Generic`, `Jailbreak.Rebel`, `Jailbreak.Logs`, `Jailbreak.Zones` (via `@s2script/zones`), `Jailbreak.Debug`, `MapUtil`, `RoundUtil` |
| `@edgegamers/jailbreak-warden` | warden selection/queue/auto-warden, warden commands (open, peace, count, countdown, roll, marker, soccer, chicken, ST), markers, paint/laser, warden + ST icons, special treatment, peace mute | `Jailbreak.Warden`, `Jailbreak.Mute`, `Jailbreak.Draw` |
| `@edgegamers/jailbreak-lastrequest` | last requests (8 games), LR rebel, last guard | `Jailbreak.LastRequest`, `Jailbreak.LastGuard` |
| `@edgegamers/jailbreak-specialdays` | special days (15 days), the speedrun trail | `Jailbreak.SpecialDay`, `Jailbreak.Trail` |
| `@edgegamers/jailbreak-rtd` | roll-the-dice rewards | `Jailbreak.RTD` |
| `@edgegamers/jailbreak-guards` | guard queue (`!guard`), prisoner:guard ratio, playtime priority, CT bans; MySQL/SQLite storage | CTBans (EdgeGamers GitLab), not in the Jailbreak repo |
| `@edgegamers/jailbreak-gangperks` | everything Gangs-related: JB gang perks + JB gang stats | `Gangs.*Perk`, `Gangs.BaseImpl` |
| `@edgegamers/jailbreak-shared` (library) | pure helpers bundled into each plugin: teams, colours (incl. rainbow), chat tags, player queries | `Jailbreak.Public` utils, `Jailbreak.Rainbow`, `Jailbreak.Formatting` (the parts still needed) |

Not ported as code: `Jailbreak.Validator` (s2script validates config), `Jailbreak.Tag` (folded into
the log formatter), `Jailbreak.English` (each plugin keeps its English strings next to the code in
`src/messages.ts`), the analytics `API.Stats` sink (round log `OnLog` forward is the hook point).

## Dependency graph

```
                 ┌──────────────┐
                 │   @edgegamers/jailbreak-core   │  ← every JB plugin hard-depends on core; core depends on nothing
                 └──────┬───────┘     (optional: @s2script/zones for cell/armory/spawn zones)
        ┌───────────────┼───────────────────┬──────────────┐
 ┌──────▼──────┐ ┌──────▼───────┐ ┌──────────▼─────┐ ┌──────▼──┐
 │ @edgegamers/jailbreak-warden  │ │@edgegamers/jailbreak-specialdays│ │@edgegamers/jailbreak-lastrequest │ │ @edgegamers/jailbreak-rtd │
 └──────┬──────┘ └──────────────┘ └───────▲────────┘ └─────────┘
        └──────────── hard ───────────────┘   (rtd: optional warden + optional @edgegamers/gangs)

 @edgegamers/jailbreak-guards: hard dependent of core (CT queue, ratio, CT bans; reads round mode only)

 @edgegamers/jailbreak-gangperks: hard @edgegamers/gangs; optional core / warden / lastrequest / specialdays
```

Rules:

1. **Dependencies point one way.** Core knows nothing about warden; warden knows nothing about
   LR. When a lower plugin must react to a higher one, the higher one listens to the lower one's
   forward (e.g. warden revokes special treatment on core's `OnRebelChanged`).
2. **Jailbreak never talks to Gangs.** `@edgegamers/jailbreak-gangperks` is the only bridge. JB plugins expose
   `Transform` forwards for anything cosmetic a perk can change (warden icon, ST icon, paint
   colour, LR colour, bomb kill-feed icon); gangperks patches them from cached gang data. Remove
   gangperks and JB runs unchanged.
3. **One owner per round.** Core's `setMode` arbitrates who owns the end of a round (LR, last guard,
   special day). It resets to `"normal"` on every round start. A plugin must claim the mode before
   it starts its thing and must back off if the claim is refused.
4. **Contracts are synchronous** (protocol 2). Methods answer from in-memory state. Never put a
   Promise, BigInt, function, class, `any`/`unknown` on the wire; optional *union* parameters (e.g.
   `x?: boolean`) are rejected by the checker — make them required.
5. **Identity.** A `slot` is valid only now. Anything held across a timer/await keeps `userId`
   (re-resolve with `Player.fromUserId`) or `steamId` (decimal string, never a number). Contract
   payloads carry a copied `PlayerRef { slot, userId, steamId, name }`.
6. **Per-round state resets on core's `OnRoundStart`,** not on the raw `round_start` game event, so
   every plugin sees core's reset first.

## Contracts

Each producer's contract is its `api.d.ts` (the package `types`). Consumers in this workspace import
it directly (`import { isRebel } from "@edgegamers/jailbreak-core"` or `use("@edgegamers/jailbreak-core")`). Out-of-workspace contracts
are checked in as verified copies under `.s2script/types/<name>/index.d.ts`:

- `@edgegamers/gangs` (from `gabehirakawa/s2s-gangs`, v1 — synchronous) in `rtd` and `gangperks`.
- `@s2script/zones` (s2script base plugin) in `core` and `specialdays`.

`.s2script/interfaces.d.ts` is generated by `s2s build` and git-ignored.

## Plugin layout & conventions

```
plugins/<name>/
  package.json        s2script block: interfaceProtocol 2, publishes "self" (if it has api.d.ts),
                      libraries { @edgegamers/jailbreak-shared }, plugin deps, config keys
  api.d.ts            the published contract (if any)
  src/plugin.ts       OnPluginStart + named publics; wiring only
  src/<feature>.ts    one file per feature
  src/messages.ts     every player-facing English string
  test/*.test.ts      pure-logic unit tests (node --test), optional
```

- Authoring is SDK 0.27 style: `export function OnPluginStart()`; `command`, `hook`, `publish`, `use`,
  `watchOptional`, `createScope` only inside the load window. Named publics (`OnClientDisconnect`,
  `OnMapStart`, …) for lifecycle.
- Configuration replaces the old FakeConVars: declare keys under `s2script.config` in the plugin's
  `package.json` (same names minus the `css_jb_` prefix), read with `config.getInt(...)` etc., and
  re-read on `config.onChange`.
- Chat lines start with a coloured tag from `@edgegamers/jailbreak-shared` (`tag("Warden")`, `tag("LR")`, …).
- Commands keep their C# names (`css_warden` → `sm_warden`/`!warden`, aliases preserved).

## Verifying

`./scripts/check.sh` is the whole gate (CI runs exactly this): shared-lib declarations are fresh,
unit tests pass, and `s2s build` builds every plugin (typecheck, lint, protocol-2 contract checks).
Nothing here has been run on a live CS2 server yet; see each plugin's README for its live-test
checklist.
