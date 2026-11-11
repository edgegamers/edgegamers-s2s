/**
 * WeaponPaints storage over the portal's HTTPS API, for WeaponPaints with `storage = "plugin"`:
 * `GET /api/v1/skins/{steamId}` answers its `OnLoadRequested`, and its `OnStoreWrite` changes go
 * to `POST /api/v1/skins/{steamId}`. Contract: s2s-cs-web `docs/server-api.md`.
 *
 * The rows and writes are WeaponPaints' own (its api.d.ts) and pass through unchanged; the portal
 * validates them. Game servers therefore never connect to the portal's database.
 */
import { jsonBody, retryAfterMs, type Fetch, type HttpResponse } from "./http.ts";
import type { TokenResult } from "./token.ts";
import { errText } from "./token.ts";

const STEAM_ID_RE = /^7656119[0-9]{10}$/;
/** Tries per save, waiting 2s, 4s, ... between them on network errors, 429 and 5xx. */
export const SAVE_ATTEMPTS = 4;
const SAVE_BASE_DELAY_MS = 2_000;

/** WeaponPaints' PlayerData: the arrays of rows, kept opaque here. */
export type PlayerData = Record<string, unknown>;

export interface SkinsDeps {
  baseUrl: string;
  tokens: { get(): Promise<TokenResult>; invalidate(): void };
  fetch: Fetch;
  schedule: (ms: number, fn: () => void) => void;
  log: (m: string) => void;
  debug?: (m: string) => void;
  timeoutMs: number;
}

const ROW_LISTS = ["skins", "knife", "gloves", "music", "pins"] as const;

/** A GET body shaped like PlayerData, or null. */
export function asPlayerData(body: Record<string, unknown> | null): PlayerData | null {
  if (!body) return null;
  for (const key of ROW_LISTS) if (!Array.isArray(body[key])) return null;
  const agents = body.agents;
  if (agents !== null && (typeof agents !== "object" || Array.isArray(agents))) return null;
  const { skins, knife, gloves, music, pins } = body;
  return { skins, knife, gloves, agents, music, pins };
}

type Sent = { ok: true; res: HttpResponse } | { ok: false; retry: boolean; message: string; retryAfterMs: number | null };

export class SkinsClient {
  private readonly deps: SkinsDeps;

  constructor(deps: SkinsDeps) {
    this.deps = deps;
  }

  /** One player's rows, or null (logged) when the portal cannot answer. */
  async load(steamId: string): Promise<PlayerData | null> {
    if (!STEAM_ID_RE.test(steamId)) return null;
    const sent = await this.send("GET", steamId, "");
    if (!sent.ok) {
      this.deps.log(`skins load for ${steamId} failed: ${sent.message}`);
      return null;
    }
    const data = asPlayerData(jsonBody(sent.res));
    if (!data) this.deps.log(`skins load for ${steamId}: the portal's answer is not player data`);
    else this.deps.debug?.(`skins loaded for ${steamId}`);
    return data;
  }

  /** Save in-game changes, retrying transient failures. Never throws. */
  save(steamId: string, writes: unknown[]): Promise<boolean> {
    if (!STEAM_ID_RE.test(steamId) || writes.length === 0) return Promise.resolve(false);
    const body = JSON.stringify({ writes });
    return new Promise((resolve) => {
      const attempt = (n: number): void => {
        void this.send("POST", steamId, body).then((sent) => {
          if (sent.ok) {
            this.deps.debug?.(`skins saved for ${steamId}: ${writes.length} write(s)`);
            return resolve(true);
          }
          if (!sent.retry || n >= SAVE_ATTEMPTS) {
            this.deps.log(`skins save for ${steamId} failed: ${sent.message}; ${writes.length} change(s) not saved`);
            return resolve(false);
          }
          this.deps.schedule(sent.retryAfterMs ?? SAVE_BASE_DELAY_MS * 2 ** (n - 1), () => attempt(n + 1));
        });
      };
      attempt(1);
    });
  }

  /** One request with a token; a 401 mints a new token and tries once more. */
  private async send(method: "GET" | "POST", steamId: string, body: string, reminted = false): Promise<Sent> {
    const token = await this.deps.tokens.get();
    if (!token.ok) {
      return { ok: false, retry: token.kind !== "revoked", message: token.message, retryAfterMs: token.retryAfterMs };
    }
    const headers: Record<string, string> = { authorization: `Bearer ${token.token}`, accept: "application/json" };
    if (method === "POST") headers["content-type"] = "application/json";
    let res: HttpResponse;
    try {
      res = await this.deps.fetch(`${this.deps.baseUrl}/api/v1/skins/${steamId}`, {
        method,
        headers,
        body,
        timeoutMs: this.deps.timeoutMs,
      });
    } catch (e) {
      return { ok: false, retry: true, message: `request failed: ${errText(e)}`, retryAfterMs: null };
    }
    if (res.status === 200) return { ok: true, res };
    if (res.status === 401 && !reminted) {
      this.deps.tokens.invalidate();
      return this.send(method, steamId, body, true);
    }
    const b = jsonBody(res);
    const message = `${res.status}${typeof b?.error === "string" ? ` ${b.error}` : ""}`;
    const retry = res.status === 429 || res.status >= 500;
    return { ok: false, retry, message, retryAfterMs: retryAfterMs(res) };
  }
}
