// src/v2-wire.ts — maul3 v2 wire shapes and the pure mapping onto the domain model.
// Zero I/O, zero SDK imports (the SDK ships types only, so anything importing it is untestable).
// This is where the two API versions are reconciled — the unit-test target.

import { notFound } from "./backend.ts";
import type { PlayerLookup } from "./backend.ts";
import type { WireDsInfo, WireUserGroup } from "./types.ts";
import type { BackendResult } from "./backend.ts";

/** The `{success, data, error}` wrapper every v2 REST route returns (token exchange excepted). */
interface V2Envelope<T> {
  success?: boolean;
  data?: T;
  error?: { code?: string; message?: string };
}

export interface V2LookupData {
  found?: boolean;
  id?: number;
  gameIdValue?: string;
  verified?: boolean;
  user?: {
    userId?: number;
    name?: string;
    state?: number;
    division?: { id?: number; name?: string; tag?: string } | null;
    primaryGroup?: { id?: number; name?: string; rank?: number; permissions?: number } | null;
    groups?: { id?: number; name?: string; rank?: number }[];
    verified?: boolean;
  } | null;
  dsInfo?: WireDsInfo | null;
  status?: { isBanned?: boolean; hasPenalties?: boolean; activePenaltiesCount?: number };
  activePenalties?: {
    id?: number;
    type?: string;
    reason?: string;
    expiresAt?: string | null;
    permanent?: boolean;
  }[];
}

/** RFC 6749 §5.1 token response — a bare object, not the v2 envelope. */
export interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

/** Parse a v2 envelope into a result, surfacing `error.code: message` when present. */
export function parseV2Envelope<T>(status: number, body: string): BackendResult<T> {
  let env: V2Envelope<T>;
  try {
    env = JSON.parse(body) as V2Envelope<T>;
  } catch {
    return { ok: false, reason: `unparseable body (HTTP ${String(status)})` };
  }

  if (env.success === true && env.data !== undefined) return { ok: true, data: env.data };

  const err = env.error;
  return {
    ok: false,
    reason: err ? `${err.code ?? "error"}: ${err.message ?? ""}` : `HTTP ${String(status)}`,
  };
}

/**
 * Map a v2 lookup body onto the version-agnostic domain shape. PURE — the unit-test target, and
 * the one place the two API versions are reconciled.
 *
 * Ban state comes from `activePenalties` (type `ban`) rather than `status.isBanned`, because
 * `isBanned` reflects only the legacy bans table while penalties are the v2 source of truth.
 */
export function mapV2Lookup(data: V2LookupData, now: number = Date.now()): PlayerLookup {
  if (data.found !== true) return notFound();

  const user = data.user ?? null;
  const groups: WireUserGroup[] = (user?.groups ?? []).map((g) => ({
    rank: g.rank ?? 0,
    ...(g.name !== undefined ? { name: g.name } : {}),
  }));

  // `activePenalties` is NOT filtered by expiry — maul3 returns expired rows in it and reports the
  // real state separately in `status.isBanned`. Checking expiry here is load-bearing: without it an
  // expired ban kicks the player forever. (Learned the hard way: a 1-minute test ban kept kicking
  // 30+ minutes later while status.isBanned already said false.)
  const activeBan = (data.activePenalties ?? []).find(
    (p) => p.type === "ban" && isPenaltyInForce(p, now),
  );

  // Fall back to status.isBanned so a ban recorded only in the legacy bans table still enforces.
  const legacyBanned = activeBan === undefined && data.status?.isBanned === true;

  const ban = activeBan
    ? {
        active: true,
        minutes: activeBan.permanent === true ? 0 : minutesUntil(activeBan.expiresAt ?? null, now),
        reason: activeBan.reason ?? "",
      }
    : legacyBanned
      ? { active: true, minutes: 0, reason: "Banned" }
      : { active: false, minutes: 0, reason: "" };

  return {
    found: true,
    ban,
    userId: user?.userId ?? 0,
    name: user?.name ?? "",
    divisionTag: user?.division?.tag ?? "",
    primaryRank: user?.primaryGroup?.rank ?? 0,
    groups,
    ds: data.dsInfo ?? undefined,
    verified: data.verified === true || user?.verified === true,
    gameIdPk: data.id ?? null,
  };
}

/**
 * Is this penalty still in force at `nowMs`?
 *
 * Permanent = always. Otherwise it needs a parseable expiry in the future. A non-permanent penalty
 * with no usable expiry is treated as NOT in force — maul3 always sets expiresAt from lengthMinutes,
 * so a missing one means the row is not a live timed ban, and over-kicking is the worse failure.
 */
export function isPenaltyInForce(
  penalty: { permanent?: boolean; expiresAt?: string | null },
  nowMs: number,
): boolean {
  if (penalty.permanent === true) return true;
  const expiresAt = penalty.expiresAt;
  if (expiresAt === null || expiresAt === undefined || expiresAt.length === 0) return false;
  const at = Date.parse(expiresAt);
  return Number.isFinite(at) && at > nowMs;
}

/**
 * Whole minutes remaining, floored at 1 for anything still in the future so an about-to-expire ban
 * does not render as "0 minutes" (which the domain shape reserves for permanent). Returns 0 for an
 * already-expired timestamp — callers must gate on isPenaltyInForce, not on this.
 */
export function minutesUntil(expiresAt: string | null, nowMs: number = Date.now()): number {
  if (expiresAt === null || expiresAt.length === 0) return 0;
  const at = Date.parse(expiresAt);
  if (!Number.isFinite(at) || at <= nowMs) return 0;
  return Math.max(1, Math.ceil((at - nowMs) / 60_000));
}

