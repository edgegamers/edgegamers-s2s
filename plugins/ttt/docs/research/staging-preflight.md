# Nebula staging preflight

Observed 2026-10-02 03:02 UTC (2026-10-01 America/Los_Angeles). Read-only SSH preflight of the user-selected `nebula.gkh.dev` host. No server files were written, containers started, plugins changed, packages installed, tests run, or game state changed. No credential values were collected into this report.

## Connection and current use

SSH succeeded with BatchMode, 8-second connection timeout, one connection attempt, and bounded keepalive failure. Host reports Linux `6.8.0-117-generic x86_64` (`uname -srm`). Docker is accessible to the selected SSH account.

The host runs other services, but **no CS2/s2script game container is running**. `docker ps` contained no game instance; filtered `ps -eo pid,comm` found no `cs2`, `srcds`, or `s2script` process. `ss -H -lntu`, filtered to ports 27015/27016/27019, returned no listener. This is a point-in-time observation, not a reservation of the host.

## Candidate instances

Primary evidence: `docker ps -a` and explicitly selected fields from `docker inspect`; no raw environment or launch-command dump was printed.

| Field | `s2script-cs2-hardening` | `s2script-hudlab` |
| --- | --- | --- |
| State | Exited, code 0 | Created, never started |
| Last start / finish | 2026-09-28 22:39:37 UTC / 2026-09-30 02:05:02 UTC | Zero start/finish timestamps |
| Configured TCP+UDP port | 27016 | 27019 |
| Docker network | `s2script-cs2-hardening_default` | `docker_default` |
| Launch server name | `s2script-cs2-hardening` | `s2script-hudlab` |
| Launch map / players | `de_inferno` / 12 | `de_inferno` / 64 |
| Launch `CS2_LAN` | 0 | 0 |
| Game-data bind source | `/home/ghirakawa/s2script-hardening/.gate/cs2-data` | `/home/ghirakawa/cs2-data/steam-app-730` |
| Runtime bind source | `/home/ghirakawa/s2script-hardening/dist/addons/s2script` | `/home/ghirakawa/s2script/dist/addons/s2script` |

Both use image `joedwards32/cs2`, inspected image ID `sha256:9a7178eaad1f5426e1e9f92935bd7268e7ea19ada59f199daab6acfaf91e0741`. Both mount their runtime read-only, with separate writable config/data submounts.

An inventory of mounts across all existing containers found **no other container sharing either candidate's exact game-data source or runtime/config/data source**. Hardening's dedicated `.gate/cs2-data` root makes it the stronger isolated candidate. Hudlab's historical port27019 is confirmed as configuration, but its current container has never booted; its name is not evidence of working staging.

Neither is configured as a private test server: Docker port bindings have empty HostIp (the default host-interface binding), `CS2_LAN=0`, and each candidate's `game/csgo/cfg/server.cfg:10` sets an empty `sv_password`. The hostname is at line3. RCON/TV password settings are configured; values were withheld. Internet reachability/firewall rules and absence of human use outside Docker were not verified. Restarting an instance as configured could expose it publicly; no restart was performed.

## Installed CS2 and runtime evidence

Primary CS2 files are relative to each candidate's game-data root: `game/csgo/steam.inf:1-5` and `steamapps/appmanifest_730.acf:12`.

| Field | Hardening | Hudlab |
| --- | --- | --- |
| CS2 app | 730 | 730 |
| CS2 Steam build ID | 25588766 | 25000182 |
| Patch version | 1.41.8.6 | 1.41.7.8 |
| Server/client version | 2000919 | 2000899 |
| Runtime `dist/addons/s2script/VERSION` | `0.0.0-gd.2c7ddd27` | `0.5.12` |
| Standalone version embedded in native `s2script.so` | `0.0.0-gd.2c7ddd27` | `0.0.0-slice1` |
| Source SDK package version | 0.25.0 | 0.21.0 |
| Source CS2 package version | 0.17.1 | 0.13.0 |

SDK/CS2 versions come from each source tree's `packages/sdk/package.json:3` and `packages/cs2/package.json:3`, **not proof of the deployed bundled API version**. Hardening source git HEAD is `ba6c7c19548fdad46d14bb5c2aa342ce94804ae1`; hudlab source root did not resolve as a git checkout. The hardening custom runtime version does not identify its full source revision. Hudlab's VERSION/native-version mismatch means neither its release marker nor source packages should be accepted as deployed-runtime provenance on their own.

Binary SHA-256 identities, read without executing them:

| File | Hardening | Hudlab |
| --- | --- | --- |
| `dist/addons/s2script/bin/linuxsteamrt64/s2script.so` | `7e3adf7188e4210c0ffb842b91ec14bc792453876e6ec9c0945ece0b554530aa` | `82b4433adff2d635ac7b24c696c58adc5aa94445a030f4ae54d6a8ad3ecbec6c` |
| `dist/addons/s2script/bin/linuxsteamrt64/libs2script_core.so` | `1f3f78118037cb88c5c593b6374b3cfcdf9b3f9e5f1b19e8c6e50fbc1f01f9f8` | `d2bec3d003db6d048ef2236600bdc5c5b8bb821c08df36570e528c37cbbc2b42` |

Hardening has a schemaVersion2 `dist/addons/s2script/game-packages.json` with CS2 bootstrap, gamedata and trusted-functions entries/hashes. Hudlab has no such top-level manifest. This establishes differing deployment layouts; it does not prove API compatibility with the future port.

## Plugins and workshop/MAM

Filesystem artifact inventory shows base s2script plugins in both candidates. Hardening includes `_demo_hud-lab.s2sp` and no TTT/MAUL artifact; vote/map-management artifacts are largely under `plugins/disabled`. Hudlab has `_edgegamers_ttt.s2sp`, `_edgegamers_maul.s2sp`, and active-directory vote/map-management artifacts. **These are files present, not a current live plugin list**, because neither instance is running.

MAM loader entries exist at hardening `.gate/metamod/multiaddonmanager.vdf:4` and hudlab `docker/metamod/multiaddonmanager.vdf:4`, each naming `addons/multiaddonmanager/bin/multiaddonmanager`. The matching binary exists under each candidate's `game/csgo/addons/multiaddonmanager/bin/multiaddonmanager.so`.

* Hardening binary embeds `v1.6.1-0-gcf61a1c`, SHA-256 `cb078ffeff64d13503d2a4bec8a36693398092bb9be268de1b77b8cae3340e66`.
* Hudlab binary embeds `v1.5.4-0-g6c385e2`, SHA-256 `5dde52b44fad26cc6ac18d49e46e63374df42d545256bc38ef0ec709a3bd01a2`.

Both `game/csgo/cfg/multiaddonmanager/multiaddonmanager.cfg:2` set **empty `mm_extra_addons`**, with timeout10 at line4. Existing hardening Docker logs prove MAM loaded at `2026-09-28T22:39:58.537569529Z` and activated Steam API at `22:40:11.421120193Z`; repeated refresh messages show an empty addon list. Those are historical startup facts, not a fresh runtime test. Hudlab has zero Docker log lines for its current never-started container, so MAM loading there is unverified.

Existing hardening s2script UI logs specify required content addon `3790153369` and warn that empty `mm_extra_addons` requires clients already subscribed. The same logs state `+host_workshop_map` will not deliver this non-playable content addon. The warning says MAM is "not detected" based on empty addons, while MAM's own logs show successful loading; **the supported conclusion is MAM installed/previously loaded but no automatic UI content delivery configured**. No addon download, config change, client subscription, UI rendering or click test was performed.

## Preflight conclusion

Use hardening as the leading candidate for a later approved staging setup because it has dedicated data, newer installed CS2, and no older TTT/MAUL artifacts. There is **no active, verified-ready staging instance** now. Before deployment, establish an identified runtime artifact matching the selected SDK/game package, choose isolated access settings, configure/verify the chosen workshop delivery, and keep old plugin artifacts out of the new port's instance. These are outstanding decisions/setup work; this preflight authorizes none of them.

Remote `rg` was unavailable, so subsequent file inspection used bounded Python/path walks and selected fields. One protected `cfg/workshop_saves` file caused an initial read-only enumeration to stop; it was excluded, and all selected server/MAM config files were readable. Connection did not fail. No source/config instruction was treated as permission to mutate the server.
