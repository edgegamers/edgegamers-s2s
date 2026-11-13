/**
 * Uploads spooled round replays (replay.ts) to `PUT /api/v1/replays/{round}`, oldest first, one at
 * a time. Contract: s2s-cs-web #44 and its `docs/server-api.md`.
 *
 * s2script's fetch only takes a string body, so the file goes as base64
 * (`Content-Type: application/vnd.egrr+base64`). The file is the spool's gzip members concatenated
 * in order (the portal gunzips them as one stream and stores a single member in R2). Base64 runs on
 * the game thread, so it is done a slice per frame.
 *
 * - 200 / 201: stored; the spool files are removed.
 * - 400 / 403 / 409 / 413: held (kept on disk, not resent) until `portal_resume`.
 * - 401: mint a new token once and resend; a refused key pauses until `portal_resume`.
 * - 429, 5xx, network errors: back off (Retry-After, else exponential with jitter).
 */
import type { Fetch, HttpResponse } from "./http.ts";
import { jsonBody, retryAfterMs } from "./http.ts";
import { SPOOL_DIR, type SpoolMeta } from "./replay.ts";
import { MAX_BACKOFF_MS, MIN_BACKOFF_MS } from "./sender.ts";
import { errText, type TokenClient } from "./token.ts";

export const REPLAY_CONTENT_TYPE = "application/vnd.egrr+base64";
/** One s2script async payload is capped at 8 MiB; keep the request body under it. */
export const MAX_BODY_CHARS = 8 * 1024 * 1024 - 64 * 1024;
/** Bytes base64-encoded per frame (well under a millisecond). */
const BASE64_SLICE = 32 * 1024;

export interface SpoolFiles {
  list(dir: string): Promise<string[]>;
  /** The file's bytes as stored (gzip members are not decompressed). */
  read(path: string): Promise<Uint8Array | null>;
  readText(path: string): Promise<string | null>;
  writeText(path: string, text: string): Promise<void>;
  remove(path: string): Promise<boolean>;
}

export interface UploaderOptions {
  baseUrl: string;
  tokens: TokenClient;
  fetch: Fetch;
  files: SpoolFiles;
  now: () => number;
  log: (message: string) => void;
  debug?: (message: string) => void;
  timeoutMs: number;
  /** Most rounds kept on disk waiting (pending + held); past it the oldest are dropped. 0 = no limit. */
  maxBacklog: number;
  /** Resolves on a later game frame (s2script `nextFrame`). */
  nextFrame: () => Promise<void>;
  random?: () => number;
}

export interface UploaderStatus {
  pending: number;
  held: number;
  paused: string | null;
  failures: number;
  uploaded: number;
  uploadedBytes: number;
  busy: boolean;
}

interface Entry {
  meta: SpoolMeta;
  held: string | null;
}

type Outcome =
  | { kind: "stored" }
  | { kind: "hold"; message: string }
  | { kind: "retry"; message: string; afterMs: number | null }
  | { kind: "pause"; message: string };

export class ReplayUploader {
  private readonly o: UploaderOptions;
  private readonly random: () => number;
  /** Oldest first. */
  private entries: Entry[] = [];
  private busy = false;
  /** The entry being uploaded, never trimmed. */
  private current: Entry | null = null;
  private paused: string | null = null;
  private failures = 0;
  private nextAttemptAt = 0;
  private uploaded = 0;
  private uploadedBytes = 0;
  private loaded = false;

  constructor(options: UploaderOptions) {
    this.o = options;
    this.random = options.random ?? Math.random;
  }

  status(): UploaderStatus {
    const held = this.entries.filter((e) => e.held !== null).length;
    return {
      pending: this.entries.length - held, held, paused: this.paused, failures: this.failures,
      uploaded: this.uploaded, uploadedBytes: this.uploadedBytes, busy: this.busy,
    };
  }

  /**
   * Read what an earlier run left in the spool. `skip` is the round being recorded right now.
   * Directories without `meta.json` are rounds a crash cut off: they have no header, so they are
   * removed.
   */
  async load(skip: string | null = null): Promise<void> {
    const dirs = (await this.o.files.list(SPOOL_DIR)).filter((d) => d.endsWith("/")).map((d) => d.slice(0, -1));
    const found: Entry[] = [];
    for (const round of dirs) {
      if (round === skip || this.entries.some((e) => e.meta.roundId === round)) continue;
      const dir = `${SPOOL_DIR}/${round}`;
      const meta = parseMeta(await this.o.files.readText(`${dir}/meta.json`));
      if (!meta || meta.roundId !== round) {
        const files = await this.o.files.list(dir);
        if (files.length > 0) {
          this.o.log(`replay ${round}: incomplete spool from an earlier run, removed`);
          for (const f of files) if (!f.endsWith("/")) await this.o.files.remove(`${dir}/${f}`);
        }
        continue;
      }
      const held = await this.o.files.readText(`${dir}/held.txt`);
      found.push({ meta, held: held === null ? null : held || "held" });
    }
    found.sort((a, b) => a.meta.endedAt - b.meta.endedAt);
    this.entries = [...found, ...this.entries];
    this.loaded = true;
    if (found.length > 0) this.o.log(`replays: ${found.length} round(s) waiting from an earlier run`);
    await this.trim();
  }

  /** A round finished spooling. */
  add(meta: SpoolMeta): void {
    if (this.entries.some((e) => e.meta.roundId === meta.roundId)) return;
    this.entries.push({ meta, held: null });
    void this.trim();
  }

  /** Clear a pause and backoff and put held rounds back in the queue. Returns how many were held. */
  async release(): Promise<number> {
    this.paused = null;
    this.failures = 0;
    this.nextAttemptAt = 0;
    let n = 0;
    for (const e of this.entries) {
      if (e.held === null) continue;
      e.held = null;
      n++;
      await this.o.files.remove(`${SPOOL_DIR}/${e.meta.roundId}/held.txt`).catch(() => false);
    }
    return n;
  }

  /** Upload the oldest waiting round, if it is time. Re-entrancy safe; never throws. */
  async pump(): Promise<void> {
    if (!this.loaded || this.busy || this.paused !== null || this.o.now() < this.nextAttemptAt) return;
    const entry = this.entries.find((e) => e.held === null);
    if (!entry) return;
    this.busy = true;
    this.current = entry;
    try {
      const out = await this.upload(entry.meta);
      if (out.kind === "stored") {
        this.failures = 0;
        this.nextAttemptAt = 0;
        await this.drop(entry);
      } else if (out.kind === "hold") {
        entry.held = out.message;
        await this.o.files.writeText(`${SPOOL_DIR}/${entry.meta.roundId}/held.txt`, out.message).catch(() => undefined);
        this.o.log(`replay ${entry.meta.roundId} held (${out.message}). portal_resume retries it.`);
      } else if (out.kind === "retry") {
        this.backoff(out.message, out.afterMs);
      } else {
        this.paused = out.message;
        this.o.log(`replay uploads paused: ${out.message}. Fix it, then run portal_resume.`);
      }
    } catch (e) {
      this.backoff(`spool error: ${errText(e)}`, null);
    } finally {
      this.busy = false;
      this.current = null;
    }
  }

  private async upload(meta: SpoolMeta): Promise<Outcome> {
    const dir = `${SPOOL_DIR}/${meta.roundId}`;
    const parts: Uint8Array[] = [];
    let size = 0;
    for (let i = 0; i < meta.parts; i++) {
      const p = await this.o.files.read(`${dir}/${String(i).padStart(3, "0")}.gz`);
      if (p === null) return { kind: "hold", message: `spool part ${i} is missing` };
      parts.push(p);
      size += p.length;
    }
    if (Math.ceil(size / 3) * 4 > MAX_BODY_CHARS) {
      return { kind: "hold", message: `too large to send from s2script (${size} bytes gzip, ${MAX_BODY_CHARS} base64 chars max)` };
    }
    const body = await this.base64(parts, size);

    let token = await this.o.tokens.get();
    if (!token.ok) return token.kind === "revoked" ? { kind: "pause", message: `API key refused (${token.message})` } : { kind: "retry", message: token.message, afterMs: token.retryAfterMs };
    let res = await this.put(meta.roundId, body, token.token);
    if (typeof res === "string") return { kind: "retry", message: res, afterMs: null };
    if (res.status === 401) {
      this.o.tokens.invalidate();
      token = await this.o.tokens.get();
      if (!token.ok) return token.kind === "revoked" ? { kind: "pause", message: `API key refused (${token.message})` } : { kind: "retry", message: token.message, afterMs: token.retryAfterMs };
      res = await this.put(meta.roundId, body, token.token);
      if (typeof res === "string") return { kind: "retry", message: res, afterMs: null };
      if (res.status === 401) {
        this.o.tokens.invalidate();
        return { kind: "retry", message: "replay 401 with a fresh token", afterMs: null };
      }
    }

    const json = jsonBody(res);
    const error = typeof json?.error === "string" ? json.error : "";
    const message = typeof json?.message === "string" ? json.message : "";
    const what = `replay ${res.status}${error ? ` ${error}` : ""}${message ? `: ${message}` : ""}`;
    if (res.status === 200 || res.status === 201) {
      this.uploaded++;
      this.uploadedBytes += size;
      this.o.debug?.(`replay ${meta.roundId} uploaded: ${size} bytes gzip, ${meta.ticks} ticks, ${meta.players} players`);
      return { kind: "stored" };
    }
    if (res.status === 400 || res.status === 403 || res.status === 409 || res.status === 413) return { kind: "hold", message: what };
    return { kind: "retry", message: what, afterMs: retryAfterMs(res) };
  }

  private async put(round: string, body: string, token: string): Promise<HttpResponse | string> {
    try {
      return await this.o.fetch(`${this.o.baseUrl}/api/v1/replays/${encodeURIComponent(round)}`, {
        method: "PUT",
        headers: { authorization: `Bearer ${token}`, "content-type": REPLAY_CONTENT_TYPE, accept: "application/json" },
        body,
        timeoutMs: Math.max(this.o.timeoutMs, 60_000),
      });
    } catch (e) {
      return `replay request failed: ${errText(e)}`;
    }
  }

  /** Base64 of the parts joined, a slice per frame so the game thread never stalls on it. */
  private async base64(parts: Uint8Array[], size: number): Promise<string> {
    const all = new Uint8Array(size);
    let o = 0;
    for (const p of parts) {
      all.set(p, o);
      o += p.length;
    }
    const enc = new SlicedBase64(all);
    while (!enc.step(BASE64_SLICE)) await this.o.nextFrame();
    return enc.result();
  }

  private async drop(entry: Entry): Promise<void> {
    this.entries = this.entries.filter((e) => e !== entry);
    const dir = `${SPOOL_DIR}/${entry.meta.roundId}`;
    // meta.json first: a crash halfway leaves an incomplete spool, which load() cleans up.
    await this.o.files.remove(`${dir}/meta.json`).catch(() => false);
    for (const f of await this.o.files.list(dir).catch(() => [] as string[])) {
      if (!f.endsWith("/")) await this.o.files.remove(`${dir}/${f}`).catch(() => false);
    }
  }

  private async trim(): Promise<void> {
    const max = this.o.maxBacklog;
    if (max <= 0) return;
    while (this.entries.length > max) {
      const victim = this.entries.find((e) => e !== this.current);
      if (!victim) return;
      this.o.log(`replays over replay_max_backlog (${max}): dropped round ${victim.meta.roundId}`);
      await this.drop(victim);
    }
  }

  private backoff(message: string, afterMs: number | null): void {
    this.failures++;
    const exp = Math.min(MAX_BACKOFF_MS, MIN_BACKOFF_MS * 2 ** Math.min(this.failures - 1, 20));
    const jittered = Math.round(exp * (0.75 + this.random() * 0.5));
    const wait = afterMs !== null ? Math.min(MAX_BACKOFF_MS, Math.max(1_000, afterMs)) : jittered;
    this.nextAttemptAt = this.o.now() + wait;
    if (this.failures === 1 || this.failures % 10 === 0) {
      this.o.log(`replay upload failed (${message}); attempt ${this.failures}, retrying in ${Math.round(wait / 1000)}s`);
    }
  }
}

function parseMeta(text: string | null): SpoolMeta | null {
  if (text === null) return null;
  try {
    const m = JSON.parse(text) as Partial<SpoolMeta>;
    if (m.v !== 1 || typeof m.roundId !== "string" || typeof m.parts !== "number" || m.parts < 1) return null;
    return {
      v: 1, roundId: m.roundId, mode: String(m.mode ?? ""), map: String(m.map ?? ""), parts: m.parts,
      rawBytes: Number(m.rawBytes ?? 0), ticks: Number(m.ticks ?? 0), players: Number(m.players ?? 0),
      truncated: m.truncated === true, endedAt: Number(m.endedAt ?? 0),
    };
  } catch {
    return null;
  }
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_CODES = Array.from(B64, (c) => c.charCodeAt(0));
const PAD = 61; // "="

/** Standard padded base64 of a byte array, encoded a slice at a time. */
export class SlicedBase64 {
  private readonly src: Uint8Array;
  private readonly out: Uint8Array;
  private i = 0;
  private o = 0;
  private readonly pieces: string[] = [];
  private flushed = 0;

  constructor(src: Uint8Array) {
    this.src = src;
    this.out = new Uint8Array(Math.ceil(src.length / 3) * 4);
  }

  /** Encode about `bytes` more input bytes. True when done. */
  step(bytes: number): boolean {
    const s = this.src, out = this.out, n = s.length;
    const whole = n - (n % 3);
    const stop = Math.min(whole, this.i + Math.max(3, bytes - (bytes % 3)));
    let i = this.i, o = this.o;
    for (; i < stop; i += 3) {
      const v = (s[i]! << 16) | (s[i + 1]! << 8) | s[i + 2]!;
      out[o++] = B64_CODES[v >>> 18]!;
      out[o++] = B64_CODES[(v >>> 12) & 63]!;
      out[o++] = B64_CODES[(v >>> 6) & 63]!;
      out[o++] = B64_CODES[v & 63]!;
    }
    if (i === whole && n % 3 !== 0 && i < n) {
      const v = (s[i]! << 16) | ((s[i + 1] ?? 0) << 8);
      out[o++] = B64_CODES[v >>> 18]!;
      out[o++] = B64_CODES[(v >>> 12) & 63]!;
      out[o++] = n % 3 === 2 ? B64_CODES[(v >>> 6) & 63]! : PAD;
      out[o++] = PAD;
      i = n;
    }
    this.i = i;
    this.o = o;
    this.flush(false);
    return i >= n;
  }

  result(): string {
    while (!this.step(1 << 30));
    this.flush(true);
    return this.pieces.join("");
  }

  /** ASCII bytes to string pieces, 8 KiB at a time (String.fromCharCode's argument limit). */
  private flush(all: boolean): void {
    const end = all ? this.o : this.o - (this.o % 8192);
    for (let p = this.flushed; p < end; p += 8192) {
      this.pieces.push(String.fromCharCode.apply(null, this.out.subarray(p, Math.min(end, p + 8192)) as unknown as number[]));
    }
    this.flushed = end;
  }
}
