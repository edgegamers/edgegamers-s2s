# Staging start-ready command

This host-side command starts the existing staging container when requested, waits for the pinned runtime and 25 plugin identities, and primes one future map manifest per Docker StartedAt. It is invoked explicitly; boot.sh, ordinary RCON commands and plugin reloads do not run it. Current installation and no-effect acceptance are recorded in the staging evidence report. Cold-start and native anchor-rendering acceptance remain separate.

## Intended invocation boundary

Invoke explicitly from the host startup workflow, after the existing container start (or allow this script to start that same stopped container). Do not put it in `rcon.py`, a plugin-reload handler, a recurring service, or an ordinary command wrapper. `boot.sh` and protected `console-bootstrap.py` remain unchanged. The script uses the existing bootstrap helper and `rcon.py --password-file`; it does not read the password file itself.

Explicit staging start command after installation:

```sh
python3 /home/ghirakawa/s2s-ttt-staging/start-ready/prime.py \
  --target-map de_inferno \
  --password-file /home/ghirakawa/s2s-ttt-staging/private/rcon.env \
  --state-dir /home/ghirakawa/s2s-ttt-staging/private/start-prime \
  --start-if-stopped --timeout 180
```

To seed the currently known already-primed start without another map cycle, use the same command with `--seed-already-primed-started-at '<exact Docker StartedAt>'` and omit `--start-if-stopped`. This is an explicit operator attestation plus fresh identity/readiness/map/zero-human checks. Seed mode refuses a stopped container even when the start flag is supplied, and refuses unavailable authenticated RCON instead of bootstrapping. It cannot start, bootstrap or cycle the map. It refuses to erase a pending map operation. Root must review the actual StartedAt before invoking it; no value is invented in this prototype.

## State/effect protocol

1. Acquire a nonblocking exclusive file lock for the entire bounded run. The private state directory must be owned by the caller and mode 0700, with owner-only regular lock/state files. State replacement is atomic and fsynced, with a fixed 64-start/64KiB bound. Malformed state fails closed. The optional `start_pending` must be exactly a stopped identity: a 64-character lowercase hexadecimal container ID and two calendar-valid Docker UTC timestamps. Only the exact all-zero year-0001 Docker sentinel is permitted there; running-start entries require nonzero timestamps and full container IDs.
2. Inspect the fixed `s2s-ttt-cs2` container's state and full ID in one Docker query. Only `created`/`exited`, `Running=false`, and `Pid=0`, freshly unchanged, authorize optional `docker start`. A separate durable `start_pending` prevents blind retry of an unknown start against the same stopped identity. There is no restart, stop, deletion, or kick operation.
3. Retain full container ID and StartedAt and recheck them around external reads/effects. Each StartedAt gets independent bootstrap and map-cycle states. A new cold-start identity can prime once; plugin reloads cannot create a new prime entitlement.
4. Read-only RCON status first. If unavailable on an unbootstrapped start, poll fresh localhost UDP 27025 A2S_INFO. Require app 730 and players minus bots exactly zero. A connected UDP socket filters source endpoint; parser accepts one exact challenge, rejects split/truncated/malformed/negative-count/unknown-field responses, and validates every advertised field. Persist `bootstrap=pending`; repeat the fresh A2S zero-human and container checks; invoke the existing protected helper once. Unknown outcome remains pending. A later read-only authenticated status can resolve it, but unavailability never reissues that bootstrap, including after a prior successful bootstrap followed by readiness failure.
5. Wait for exactly the retained 25 unique `(running)` plugin names and exact runtime `0.7.0+interop-fix.10379521277a`, plus current valid A2S. These are copied from existing public readiness evidence, not guessed from count alone. Wrong, duplicate, missing, extra, malformed, or non-running identities do not pass. Runtime/plugin-list observations are readiness evidence, not archive-byte attestation.
6. An already-ready matching identity only checks readiness and returns `already_ready`; no cycle on ordinary subsequent invocation. An explicit seed validates current target map and records operator attestation without a cycle.
7. Otherwise capture a host UTC Docker-log cursor; get fresh zero-human RCON status and container identity; persist `cycle=pending` before dispatch; get fresh zero-human status again; send exactly `changelevel de_inferno`. The target is a fixed allowlist, not arbitrary console text.
8. Require a new `[s2script] map start: de_inferno (maxClients=...)` followed by a new `Host activate: Changelevel (de_inferno)`, both strictly after the stored cursor, plus exact25/runtime, current A2S target map, and fresh zero-human status. UTC comparison preserves Docker nanoseconds. Only then persist `cycle=ready`. A same-map A2S result alone is insufficient.
9. Unknown dispatch, missing markers, crash, timeout, human arrival, or changed container cannot authorize another cycle. A subsequent invocation may reconcile an existing pending cycle using read-only fresh markers/readiness; it never redispatches it. Missing proof requires operator investigation, not ledger deletion or an automatic retry.

## Bounds and limitations

- One monotonic operation budget, configurable 1–600 seconds, defaults to 180; poll interval up to one second. Every external adapter read or mutation is checked immediately before and after the call. A read or mutation already in flight can finish past the deadline; no subsequent adapter call is issued, and an effect already admitted retains its durable pending record. Every subprocess has a six-second bound. A2S has at most two two-second exchanges. One in-flight adapter call can exceed the deadline (readiness comprises at most two six-second subprocesses); there is no unbounded retry loop. No start, bootstrap, or map-cycle dispatch begins after the budget expires, including after an inspection or durable ledger write consumes the remaining time.
- Console responses/logs are captured privately and never printed; fixed JSON outcome codes only. Passwords/tokens/env/full argv/exception text are never emitted. Fixed shell-free argv call vectors only. Docker logs combine stdout/stderr so lifecycle lines on either stream are considered. Reads are limited to 256KiB after a bounded subprocess; excessive output refuses. The subprocess's anonymous temporary output file may briefly exceed this byte limit during its six-second lifetime; this is not a hard disk-quota mechanism.
- Fresh zero-human admission is a pre-dispatch observation, not an atomic engine admission lock. A player can connect between observation and mutation. No join-blocking policy is added. Root must assess this normal host-orchestration race before integration; the prototype does not claim to eliminate it.
- Completion requires known public lifecycle strings. If a future version changes them or log tailing misses them, the ledger remains pending. Host wall-clock anomalies can likewise prevent completion; they cannot authorize automatic redispatch. Exact runtime version/25 identity changes require a reviewed source update.
- Only `de_inferno` is authorized. Existing container boot remains untouched. No game/convar/player mutation other than the explicit reviewed `changelevel` and existing protected RCON bootstrap is available.
- Local tests do not validate native gameplay, map precache/rendering or client readiness. Host acceptance is recorded separately.

## Verification

Run locally without network or Docker calls:

```sh
cd /tmp/s2s-ttt-start-prime-prototype-20261004
python3 -m unittest -v
python3 -m py_compile prime.py test_prime.py
```

47 tests pass. They exercise the real state machine, private atomic filesystem ledger/process lock, strict binary parser with every mandatory-prefix truncation, injected socket challenge exchange, and fixed public-tool adapter vectors. Host commands are replaced in tests; no staging calls occur. Retained actual public plugin/meta/lifecycle lines also pass the exact parsers. The peer regressions additionally reject malformed stopped/running ledger identities, cover every mutation after a late inspection, prevent start after a late ledger write, and preserve pending records without additional I/O when an admitted mutation finishes after the deadline.

`red.log`: initial first-boot outcome failed against the no-op stub. `expanded-red.log`: actual meta-list format and mixed-precision UTC comparison failed before correction. `bootstrap-red.log`: completed bootstrap/readiness-failure could re-bootstrap before correction. `green.log`: original 37/37 run. `peer-red.log`: 44 tests against the reviewed original prototype, with 17 subtest failures exposing malformed ledger admission and deadline overruns. `peer-green.log`: current complete 45/45 run. `observed-public-formats.json` contains only copied public lines and original local receipt hashes. `SHA256SUMS` freezes the review bundle; fresh Root review of the corrected source is required before installation.

The two seed-only admission regressions failed against the reviewed prototype before the explicit seed guards were added. All 47 tests pass after that correction. Tests use fake adapters and never contact staging.
