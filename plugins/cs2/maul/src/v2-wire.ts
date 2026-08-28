import { notFound } from "./backend.ts";
import type { BackendResult, PlayerLookup } from "./backend.ts";

export interface TokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

export interface V2Penalty {
  id?: number;
  type?: string;
  reason?: string;
  permanent?: boolean;
  expiresAt?: string | null;
}

export interface V2LookupData {
  found?: boolean;
  id?: number;
  verified?: boolean;
  user?: {
    userId?: number;
    name?: string;
    division?: { id?: number; name?: string; tag?: string };
    primaryGroup?: { id?: number; name?: string; rank?: number };
    groups?: Array<{ id?: number; rank?: number; name?: string }>;
  };
  dsInfo?: { ds?: boolean; tier?: number | null; tierName?: string | null; joinMessage?: string };
  status?: { isBanned?: boolean };
  activePenalties?: V2Penalty[];
}

export function parseV2Envelope<T>(status: number, body: string): BackendResult<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, reason: `unparseable body (HTTP ${status})` };
  }
  if (parsed === null || typeof parsed !== "object") return { ok: false, reason: `unparseable body (HTTP ${status})` };
  const envelope = parsed as { success?: unknown; data?: unknown; error?: { code?: unknown; message?: unknown } };
  if (envelope.success === true && envelope.data !== undefined) return { ok: true, data: envelope.data as T };
  const code = typeof envelope.error?.code === "string" ? envelope.error.code : "";
  const message = typeof envelope.error?.message === "string" ? envelope.error.message : "";
  if (code && message) return { ok: false, reason: `${code}: ${message}` };
  if (code) return { ok: false, reason: code };
  if (message) return { ok: false, reason: message };
  return { ok: false, reason: `request failed (HTTP ${status})` };
}

export function minutesUntil(expiresAt: string | null | undefined, now = Date.now()): number {
  if (expiresAt === null || expiresAt === undefined) return 0;
  const expiry = Date.parse(expiresAt);
  if (!Number.isFinite(expiry) || expiry <= now) return 0;
  return Math.ceil((expiry - now) / 60_000);
}

export function isPenaltyInForce(penalty: Pick<V2Penalty, "permanent" | "expiresAt">, now = Date.now()): boolean {
  if (penalty.permanent === true) return true;
  if (penalty.expiresAt === null || penalty.expiresAt === undefined) return false;
  const expiry = Date.parse(penalty.expiresAt);
  return Number.isFinite(expiry) && expiry > now;
}

export function mapV2Lookup(data: V2LookupData, now = Date.now()): PlayerLookup {
  if (data.found !== true) return notFound();
  const user = data.user;
  const penalties = Array.isArray(data.activePenalties) ? data.activePenalties : [];
  const banPenalty = penalties.find((penalty) => penalty.type === "ban" && isPenaltyInForce(penalty, now));
  const ban = banPenalty === undefined
    ? data.status?.isBanned === true
      ? { active: true, minutes: 0, reason: "MAUL ban" }
      : { active: false, minutes: 0, reason: "" }
    : {
        active: true,
        minutes: banPenalty.permanent === true ? 0 : minutesUntil(banPenalty.expiresAt, now),
        reason: banPenalty.reason ?? "",
      };
  return {
    found: true,
    ban,
    userId: user?.userId ?? 0,
    name: user?.name ?? "",
    divisionTag: user?.division?.tag ?? "",
    primaryRank: user?.primaryGroup?.rank ?? 0,
    groups: (user?.groups ?? []).map((group) => ({ rank: group.rank ?? 0, ...(group.name === undefined ? {} : { name: group.name }) })),
    ds: data.dsInfo,
    verified: data.verified === true,
    gameIdPk: typeof data.id === "number" ? data.id : null,
  };
}
