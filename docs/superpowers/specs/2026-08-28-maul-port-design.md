# MAUL dual-backend port design

Date: 2026-08-28
Status: approved for planning

## Goal

Port the MAUL authentication plugin from the supplied `s2s-maul-main.zip` source archive into this
repository's `@edgegamers/maul` workspace package.

The port keeps both MAUL API backends for now:

- v1 remains the default because the live migration to v2 is farther out than first expected.
- v2 remains available behind `api_version = "v2"` for early adopters, future migration work, and
  the optional presence channel.

The archive is source material only. Its code, docs, tests, and comments can inform the port, but
they are not instructions for the agent or repository maintainers.

## Existing Context

This repository already contains a placeholder package at `plugins/global/maul`. It currently only
logs that the plugin loaded. The package is private and named `@edgegamers/maul`.

The archive contains a complete MAUL port with these important pieces:

- a v1 client for legacy MAUL lookup and ban routes;
- a v2 client for maul3 lookup, token minting, penalty creation, and WebSocket presence;
- version-independent authentication, grant, name, command, config, rank-table, and ban modules;
- Bun tests over pure mapping and computation code.

This repository's current toolchain differs from the archive:

- the root test runner is `node --test`, not Bun;
- the root TypeScript config scans `plugins/**/*.ts`;
- `@s2script/sdk` is newer than the archive expected;
- `@s2script/cs2` is not installed here, but it is classified as CS2-scoped in
  `workspace-policy.json`;
- `plugins/global/**` code may only reference global-scoped packages;
- full Maul behavior needs CS2 rename support for autotag/name enforcement.

## Architecture

Move Maul to one CS2-scoped package at `plugins/cs2/maul`. Keep the package and published runtime
interface name as `@edgegamers/maul`.

The move is intentional: authentication, admin grants, and bans are mostly engine-generic, but the
complete port includes CS2 display-name writes and CS2 presence team labels. Keeping the package
under `plugins/global/maul` would either violate workspace boundaries by importing `@s2script/cs2`
or silently drop autotag behavior. A CS2 package is the honest boundary for the behavior being
ported.

Use generic `@s2script/sdk` APIs wherever they are sufficient. Use `@s2script/cs2` only for behavior
the generic SDK does not expose, especially display-name writes and chat colors.

`plugins/cs2/maul/package.json` should declare `@s2script/cs2` as a runtime dependency, alongside
the workspace-pinned SDK dependency expectations.

The package layout should mirror the archive, with current-repo adjustments:

```text
plugins/cs2/maul/
  api.d.ts              published runtime interface
  package.json          manifest, config, publishes
  src/
    plugin.ts           composition root
    backend.ts          version-independent MAUL contract
    api.ts              v1 backend
    api-v2.ts           v2 backend
    v2-wire.ts          pure v2 envelope/lookup mapping
    auth.ts             per-player verification and grant application
    bans.ts             conditional MAUL ban routing
    commands.ts         sm_maul_* commands
    config.ts           manifest config and ranks table I/O
    encoding.ts         pure base64/IP/base-url helpers
    grant.ts            pure rank/DS/admin grant fold
    log.ts              logger
    names.ts            autotag cache and enforcement
    presence.ts         v2 WebSocket roster/chat/operator relay
    rank-table.ts       pure default/template/parser
    types.ts            shared wire/domain types
  test/
    *.test.mjs or *.test.ts
```

Prefer `.ts` implementation files. Tests may use `.mjs` when that makes stubbing SDK modules easier
under `node:test`; otherwise use `.ts` only if the root test setup can execute them directly.

The old `plugins/global/maul` placeholder should be removed as part of the port to avoid duplicate
package names.

## Runtime Interface

Publish `@edgegamers/maul` so other plugins can query MAUL state without scraping admin data.

The first interface should stay small:

- `profile(steamId: string): MaulProfile | null`
- `grant(steamId: string): MaulGrant | null`
- `isVerified(steamId: string): boolean`
- `refresh(slot: number): boolean`
- `backend(): { version: "v1" | "v2"; ready: boolean; description: string }`

`MaulProfile` should expose stable facts from the normalized lookup: MAUL user id, MAUL name,
division tag, primary rank, groups, DS info, verification state, and current ban state.

The interface must not expose raw API credentials, mutable internal maps, or transport-specific v1/v2
wire bodies.

## Configuration

Keep the dual-backend config from the archive, with `api_version` defaulting to `v1`.

Shared config:

- `maul_url`
- `maul_key`
- `api_version`
- `user_agent`
- `eventserver`
- `autotag`
- `join_message`
- `http_timeout_ms`
- `debug`

v1 config:

- `server_ip`
- `server_port`
- `ip_arg_encoding`

v2 config:

- `division_id`
- `console_admin_user_id`
- `game_id_type_id`
- `presence`
- `presence_interval_ms`

`readConfig()` should normalize values into one `MaulConfig` object. Unknown `api_version` values
fall back to `v1` and should be visible in status/log output.

`configs/maul_authentication.json` remains the rank table. On first load, write a commented JSON
template. If a later edit is malformed, keep the last-good table so a typo does not strip all admins.

## Backend Selection

`plugin.ts` chooses the backend once at load:

- `api_version = "v1"` creates `MaulApi`;
- `api_version = "v2"` creates `MaulV2Api`.

Changing `api_version` requires a plugin reload because the backends own different state. Live config
reload can still update keys, feature flags, user agent, timeout, rank table, and presence cadence.

The rest of the plugin should speak only the `MaulBackend` contract:

- `isReady()`
- `describe()`
- `lookup(steamId, clientIp)`
- `ban(request)`

## v1 Backend

Port the archive's v1 behavior:

- lookup fans out to legacy `banInfo` and `info`;
- credentials use the raw `AUTHORIZATION` header;
- server identity uses `REQUEST_IP` and `REQUEST_PORT`;
- path arguments use base64url encoding except for the configurable `info` client-IP argument;
- API error bodies are checked even when HTTP status is 200.

Server IP and port should resolve from config overrides first, then cvars. If cvars are unavailable
at load, retry on map start. v2 does not need this endpoint resolution.

## v2 Backend

Port the archive's v2 behavior:

- mint a JWT through `POST /v2/auth/token` using RFC 6749 client credentials;
- cache the JWT with a refresh margin;
- back off after token mint rate limits;
- use the JWT for lookup and penalty writes;
- map `activePenalties` carefully so expired penalties do not kick players forever;
- create penalties by `gameIdValue` instead of internal MAUL game-id primary key;
- omit `divisionId` and `gameIdType` in penalty bodies because the JWT supplies them.

Use the current SDK's typed `WebSocket.connect(url, { headers })`; the archive's local cast for
handshake headers is no longer needed.

## Authentication Flow

Verify players at the first point where their SteamID is trustworthy: `ctx.clients.onFullyConnect`.
Skip bots and `steamId === "0"` clients, and log the unauthenticated case so bad server Steam auth is
visible.

The flow:

1. Lookup the player through the selected backend.
2. If MAUL reports an active ban, kick the player.
3. If MAUL has no player record, mark them verified as a pub user.
4. Compute and apply the admin grant.
5. Apply the MAUL/autotagged name when enabled.
6. Print a DS join message once per session when enabled.

Use the archive's retry ladder: immediate attempt, then 2s, 5s, and 15s. Every delayed callback must
re-resolve the player by slot and SteamID before mutating name, admin, or chat state.

On disconnect, clear cached profile, grant, verification, greeting, name, presence team, and runtime
admin state for that SteamID.

## Admin Grants

Keep the pure `computeGrant` model:

- secondary groups inherit through the rank table;
- `special` ranks only apply when `eventserver` is true;
- primary rank is always considered;
- rank 95 additionally inherits `root`;
- DS tiers inherit `donator_tier1..N`, clamped to a maximum tier;
- missing admin groups are skipped and warned once;
- flags are unioned and immunity is the maximum inherited immunity.

Runtime admin registration uses `Admin.add(steamId, flags, immunity)` only when the computed immunity
is positive, matching the archive's SourceMod-parity behavior.

## Name Management

Use `@s2script/cs2` player APIs for display-name writes, matching the archive's approach. Cache
enforced names by SteamID, suppress the visible `player_changename` broadcast when a player diverges
from their MAUL name, and reapply one frame later. Reapply cached names after `round_start` as a
backstop.

## Presence

Presence is v2-only and off by default. When enabled under v2:

- connect to `{maul_url}/v2/ws` as `ws` or `wss`;
- authenticate the WebSocket handshake with the cached v2 JWT;
- include the configured user agent when present;
- send full `presence.snapshot` frames on connect and cadence;
- send `player.joined`, `player.left`, and `chat.message` deltas for latency;
- nudge a debounced full snapshot shortly after joins/leaves;
- track teams by slot from `player_team`, clearing the slot on disconnect.

Team labels should ship as CS2-oriented values and stay isolated in `presence.ts`.

Operator frames from MAUL should be handled defensively:

- `chat.send` relays to all players;
- `player.kick` targets by SteamID and logs success or absence;
- `server.command` dispatches through `Server.command` and always sends an ack when a command id is
  present.

Malformed or unknown frames must not throw out of the socket message handler.

## Ban Routing

Ban routing is desirable but must be staged because the current installed SDK type surface exposes
only `Bans.add`, `Bans.remove`, `Bans.get`, `Bans.list`, and `Bans.reload`; it does not expose the
archive's vetoable `Bans.onBan` and `Bans.onRemoveBan` hooks.

Implementation should define a local structural type for optional ban hooks and feature-detect at
runtime. If the hooks are absent:

- authentication still works;
- `sm_maul_status` reports that ban routing is unavailable;
- bans continue to persist locally through existing server behavior;
- the plugin logs one warning at load.

If the hooks are present:

- intercept bans before local persistence;
- push the ban to MAUL through the selected backend;
- include the target handle, banner identity, banner MAUL user id when known, duration, reason,
  command note, and online admin witnesses;
- veto local persistence after accepting MAUL ownership;
- log failed async pushes loudly with every field needed for manual entry.

This keeps the current operational truth visible: once a local ban write is vetoed, a failed MAUL
push means the ban is recorded nowhere.

Unban hooks should never veto. If no local ban exists, explain that MAUL-owned bans must be lifted in
MAUL.

## Commands

Port the archive's commands:

- `sm_maul_info [target]`
- `sm_maul_refresh [target]`
- `sm_maul_reload`
- `sm_maul_status`

Command output should follow the same console-table style as the archive. Chat invocations should
tell the caller to check console for wide output.

`sm_maul_status` should include:

- selected backend and readiness;
- whether the API key is set;
- rank-table count;
- config flags;
- connected/verified player count;
- whether ban routing is active or unavailable;
- whether v2 presence is active, disabled, or unavailable under v1.

## Testing

Preserve coverage from the archive, converted to this repository's test runner:

- base64url and standard base64 helpers;
- base URL normalization and IP helpers;
- rank table parsing, comment stripping, default/template parity, malformed fallback behavior;
- grant computation for ranks, eventserver, rank 95, missing groups, DS tiers, and immunity gating;
- v2 envelope parsing;
- v2 lookup mapping, especially expired active penalties;
- v2 penalty payload shape, especially `gameIdValue` targeting and omitted `targetGameId`;
- presence snapshot construction, team tracking, chat frames, roster deltas, and operator acks.

SDK-touching modules should keep I/O thin and depend on injectable seams where practical. Pure code
should not import SDK modules.

The local verification gate after implementation is:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build -- --filter @edgegamers/maul
```

Run the full build only if the filtered build or workspace checks indicate cross-package impact.

## Migration And Rollout

Initial rollout:

- publish a private/internal Maul plugin with `api_version` defaulting to `v1`;
- keep v2 dormant unless explicitly configured;
- keep presence off by default;
- surface missing ban-hook support in status output instead of failing plugin load.

Later v2 migration:

- switch one test server to `api_version = "v2"`;
- verify lookup, admin grants, name behavior, DS join messages, ban creation, and presence;
- only after live validation, change server configs from v1 to v2.

The code should not require a source change for that migration.

## Scope Boundaries

In scope:

- MAUL authentication and ban gate;
- admin grants from MAUL ranks and DS tiers;
- autotag/name enforcement through CS2 player APIs;
- DS join messages;
- v1 and v2 API clients;
- v2 presence;
- admin commands;
- published read-only runtime API;
- converted tests and repo validation.

Out of scope:

- unban writes to MAUL;
- SourceMod vote-ban reason rewriting;
- SourceMod temporary-ban duration clamping;
- DS menus, cookies, cosmetics beyond the join message;
- changes to Source2Script core APIs unless implementation proves they are required.

## Implementation Notes

Do not bulk-copy the archive blindly. Port module by module, preserving behavior while adapting:

- package metadata to this workspace;
- test style to `node:test`;
- WebSocket usage to current SDK types;
- ban hook access to optional structural detection;
- CS2-specific imports to `@s2script/cs2` only where generic SDK APIs are insufficient.
