# maul — MAUL authentication for CS2

An [s2script](https://github.com/s2script) port of edgeGamers' MAUL authentication plugin
(`maul-actain` / SourceMod `maul_authentication.sp`) for Counter-Strike 2.

On connect it asks MAUL who the player is, then:

- **kicks banned players** before they reach the server,
- **grants admin** by mapping the player's MAUL rank onto groups in the server's `admin_groups.json`,
- **renames** them to `<rank tag> <MAUL name>` and keeps that name enforced,
- **greets** Dedicated Supporters with their join message,
- **routes bans** issued in-game to MAUL instead of the local `bans.json`, which stays empty of
  MAUL-owned bans so MAUL remains the single source of truth,
- optionally **reports the live roster** to MAUL's presence dashboard (v2 only).

It speaks **either MAUL API** — the legacy v1 header API or the maul3 v2 API — selected with one
config key. See [API versions](#api-versions) for what differs.

## Install

```sh
bun install
bun test          # unit tests over the pure surface
s2s build .       # -> dist/_edgegamers_s2s-maul.s2sp
```

Drop the built `.s2sp` into the server's plugin directory and set at minimum `maul_key`.

Builds against `@s2script/sdk` 0.29 / `@s2script/cs2` 0.19.4 and needs an s2script runtime with host
API 3 (protocol-2 plugin interop). Ban routing uses `@s2script/basebans` 1.x, whose contract is
vendored at `.s2script/types/@s2script/basebans/index.d.ts` — an exact copy of s2script's
`plugins/basebans/api.d.ts`; refresh it with `s2s add @s2script/basebans` once the registry
serves it.

## Configuration

Set via the s2script config system (`s2script.config` in `package.json` lists the full set with
defaults). The ones that matter:

| Key | Default | Notes |
| --- | --- | --- |
| `maul_url` | `https://maul3.edgegamers.com/api` | API root. Requests go to `{root}/v1/...` or `{root}/v2/...` per `api_version`; a pasted `.../api/v1` or `.../api/v2` is trimmed back to the root. |
| `maul_key` | *(empty)* | API key. Empty disables authentication entirely. |
| `api_version` | `v1` | `v1` or `v2`. **Changing it requires a plugin reload**, not just a config re-read. |
| `eventserver` | `false` | Grant the event-gated ranks (`special` in the ranks table). |
| `autotag` | `true` | Rename players to `<tag> <MAUL name>`. |
| `join_message` | `true` | Broadcast a Dedicated Supporter's join message on first join. |
| `http_timeout_ms` | `8000` | Per-request timeout. |
| `debug` | `false` | Log request URLs and response bodies. |

**v1 only:**

| Key | Default | Notes |
| --- | --- | --- |
| `server_ip` / `server_port` | derived from cvars | Override the `REQUEST_IP` / `REQUEST_PORT` headers MAUL keys the whitelist on. Needed on hosts that bind `0.0.0.0`. |
| `ip_arg_encoding` | `plain` | How the client-IP path argument is encoded: `plain` (maul-legacy), `base64` (maul3's v1 port), or `omit`. |

**v2 only:**

| Key | Default | Notes |
| --- | --- | --- |
| `presence` | `false` | Push the live roster over the v2 WebSocket. |
| `presence_interval_ms` | `15000` | Snapshot cadence, floored at 5000. MAUL derives its freshness window from this. |

v2 needs nothing else: the API key identifies the server, and the token MAUL mints from it carries
the division, the game-id type and the owner that penalties are attributed to.

`user_agent` applies to both, and is **required** against maul3 — it sits behind Cloudflare, which
403s unrecognised agents.

### Ranks table

`configs/maul_authentication.json` maps a MAUL rank to an admin group and a name tag. It is written
with the shipped defaults on first run, and supports `//` comments. A malformed edit keeps the
last-good table rather than stripping everyone's admin.

```jsonc
"ranks": {
  "20": { "group": "eg",      "tag": "=(eG)=" },
  "31": { "group": "trainer", "special": true }   // only granted when eventserver is true
}
```

`group` names must exist in the server's own `admin_groups.json` — flags and immunity come from
there. A missing name is warned about once and skipped. Rank 95 additionally inherits `root`;
Dedicated Supporter tiers inherit `donator_tier1..N`.

## Commands

| Command | Flag | What it does |
| --- | --- | --- |
| `sm_maul_info [target]` | `GENERIC` | Cached MAUL profile and the admin grant derived from it. |
| `sm_maul_refresh [target]` | `BAN` | Force a fresh lookup and re-apply. |
| `sm_maul_reload` | `ROOT` | Re-read config + ranks table, then re-verify everyone. |
| `sm_maul_status` | `GENERIC` | Backend, key, readiness, rank count, verified/connected. |

Output follows SourceMod's console-table convention: the wide report goes to the caller's console.

## API versions

Both versions are fully wired for authentication, admin grants, name tagging and bans — everything
downstream of `src/backend.ts` is version-agnostic and neither path is a stub.

| | v1 (maul-legacy) | v2 (maul3) |
| --- | --- | --- |
| Lookup | two GETs — `banInfo` then `info`, base64url path args | one POST `/v2/players/lookup` |
| Auth | raw key in the `AUTHORIZATION` header | short-lived JWT, minted via RFC 6749 client credentials and cached |
| Server identity | `REQUEST_IP` / `REQUEST_PORT` headers, resolved from cvars | the API key alone |
| Ban | `GET ban/...` with base64url args | `POST /v2/penalties` targeting `gameIdValue` |
| Ban attribution | banner's SteamID64 (empty = eGO Council) | the API client's owner, always |
| Presence | not available | WebSocket roster push |

Known limits, both versions:

- **Bans route through BaseBans.** MAUL subscribes to `@s2script/basebans`' `OnBanRequested` hook
  (an optional plugin dependency) and vetoes the local record. Without BaseBans loaded nothing is
  routed; authentication is unaffected. Because the veto also suppresses BaseBans' own kick, MAUL
  kicks a connected target itself — including for `sm_addban` of someone on the server, which
  BaseBans alone would only record.
- **Unbans are done in MAUL, not in-game.** A MAUL-owned ban never enters the local ban cache —
  the `OnBanRequested` veto skips that write, and connect-time enforcement reads MAUL directly — so
  `sm_unban` has nothing to clear and neither API exposes an unban endpoint to push to. Lifting the
  ban in MAUL is what unbans the player. An `sm_unban` that does clear a leftover local ban is
  logged as local-only.
- **v2 bans are attributed to the API client's owner**, not the admin who issued them: the
  penalty schema has no issuing-user field. The in-game admin is still named in the penalty's
  notes (`Banned in-game via BaseBans (<source>) by <admin SteamID64 | console>`). An API client with no owner
  has its bans refused.
- **Ban duration clamping and vote-ban reason rewriting** from SourceMod's `maul_commands.sp` are
  not ported — they depend on that plugin's own config.

Further divergences from the SourceMod original are listed in
[`docs/design/maul-auth-design.md`](docs/design/maul-auth-design.md).

## Layout

```
src/
  plugin.ts     composition root — wiring, events, lifecycle
  backend.ts    the version-agnostic MAUL contract (MaulBackend, PlayerLookup, BanRequest)
  api.ts        v1 client        api-v2.ts   v2 client       v2-wire.ts  v2 shapes + pure mapping
  auth.ts       per-player verification flow, retry ladder
  grant.ts      rank -> admin flags/immunity fold (pure)
  rank-table.ts ranks-table default, template, parser (pure)
  bans.ts       ban hooks        names.ts    name enforcement
  presence.ts   v2 roster WebSocket
  config.ts     manifest + ranks-file loading    encoding.ts  base64url, hostip, IP helpers
```

`grant`, `rank-table`, `encoding` and `v2-wire` are pure — zero I/O, zero SDK imports — and are the
main unit-test target. `presence` is tested with the SDK's ws/clients modules stubbed, since they
ship types only and resolve to a host-injected runtime. The remaining SDK-touching modules are
verified by inspection and live server runs.

## Development

```sh
bun test
npx eslint .    # @s2script/eslint-plugin rules
s2s build .
```

## Publishing

Published to the s2script registry as **`@edgegamers/s2s-maul`**, a *restricted* package
(`publishConfig.access`): only members of the `edgegamers` org can see or install it. A server
installs it with `s2s install @edgegamers/s2s-maul`, with `S2SCRIPT_TOKEN` set to a token that can
read it.

CI (`.github/workflows/ci.yml`) builds, lints, typechecks and tests every PR and push. It deploys
on a `v*` tag, or when run by hand with `deploy` ticked, using the `S2SCRIPT_TOKEN` repository
secret. The registry refuses a version that already exists, so bump `version` in `package.json`
before tagging.
