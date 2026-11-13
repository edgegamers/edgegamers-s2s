// Byte-level helpers shared by the encoder and decoder: a growable writer, a bounds-checked reader,
// LEB128 varints with zigzag for signed values, and a minimal UTF-8 codec (the s2script plugin
// sandbox has no TextEncoder/TextDecoder, so neither side relies on one).

/** A growable little-endian byte buffer. `bytes()` views what was written; nothing is copied. */
export class ByteWriter {
  buf: Uint8Array;
  len = 0;
  private dv: DataView;

  constructor(initial = 1024) {
    this.buf = new Uint8Array(Math.max(16, initial));
    this.dv = new DataView(this.buf.buffer);
  }

  reset(): void { this.len = 0; }

  /** Make room for `n` more bytes, doubling so appends stay amortised O(1). */
  reserve(n: number): void {
    const need = this.len + n;
    if (need <= this.buf.length) return;
    let cap = this.buf.length * 2;
    while (cap < need) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
    this.dv = new DataView(next.buffer);
  }

  u8(v: number): void { this.reserve(1); this.buf[this.len++] = v & 0xff; }
  u16(v: number): void { this.reserve(2); this.dv.setUint16(this.len, v, true); this.len += 2; }
  u32(v: number): void { this.reserve(4); this.dv.setUint32(this.len, v >>> 0, true); this.len += 4; }
  f32(v: number): void { this.reserve(4); this.dv.setFloat32(this.len, v, true); this.len += 4; }
  f64(v: number): void { this.reserve(8); this.dv.setFloat64(this.len, v, true); this.len += 8; }

  /** Unsigned LEB128 for 0 <= v < 2^32. */
  uvar(v: number): void {
    this.reserve(5);
    const b = this.buf;
    v = v >>> 0;
    while (v >= 0x80) { b[this.len++] = (v & 0x7f) | 0x80; v >>>= 7; }
    b[this.len++] = v;
  }

  /** Zigzag + LEB128 for a signed 32-bit value. */
  svar(v: number): void { this.uvar(((v << 1) ^ (v >> 31)) >>> 0); }

  bytesOf(src: Uint8Array): void { this.reserve(src.length); this.buf.set(src, this.len); this.len += src.length; }

  /** A varint length followed by the UTF-8 bytes. */
  str(s: string): void { const b = utf8Encode(s); this.uvar(b.length); this.bytesOf(b); }

  bytes(): Uint8Array { return this.buf.subarray(0, this.len); }
}

export class ReplayFormatError extends Error {
  constructor(message: string) { super(message); this.name = "ReplayFormatError"; }
}

/** Reads from one byte slice; every read throws ReplayFormatError past the end. */
export class ByteReader {
  pos: number;
  readonly buf: Uint8Array;
  readonly end: number;
  private readonly dv: DataView;

  constructor(buf: Uint8Array, pos = 0, end = buf.length) {
    this.buf = buf;
    this.pos = pos;
    this.end = end;
    this.dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  private need(n: number): void {
    if (this.pos + n > this.end) throw new ReplayFormatError("replay is truncated");
  }

  u8(): number { this.need(1); return this.buf[this.pos++]; }
  u16(): number { this.need(2); const v = this.dv.getUint16(this.pos, true); this.pos += 2; return v; }
  u32(): number { this.need(4); const v = this.dv.getUint32(this.pos, true); this.pos += 4; return v; }
  f32(): number { this.need(4); const v = this.dv.getFloat32(this.pos, true); this.pos += 4; return v; }
  f64(): number { this.need(8); const v = this.dv.getFloat64(this.pos, true); this.pos += 8; return v; }

  uvar(): number {
    const b = this.buf;
    let v = 0, shift = 0;
    for (;;) {
      if (this.pos >= this.end) throw new ReplayFormatError("replay is truncated");
      const c = b[this.pos++];
      if (shift === 28) {
        if (c > 0x0f) throw new ReplayFormatError("varint overflows 32 bits");
        return (v | (c << 28)) >>> 0;
      }
      v |= (c & 0x7f) << shift;
      if (c < 0x80) return v >>> 0;
      shift += 7;
    }
  }

  svar(): number { const u = this.uvar(); return (u >>> 1) ^ -(u & 1); }

  str(): string {
    const n = this.uvar();
    this.need(n);
    const s = utf8Decode(this.buf.subarray(this.pos, this.pos + n));
    this.pos += n;
    return s;
  }

  skip(n: number): void { this.need(n); this.pos += n; }
}

/**
 * Peek an unsigned varint at `pos` without throwing: returns [value, bytesUsed], or null when the
 * buffer ends inside it. The streaming decoder uses this to tell whether a whole chunk has arrived.
 */
export function peekUvar(buf: Uint8Array, pos: number, end: number): [number, number] | null {
  let v = 0, shift = 0;
  for (let i = pos; i < end; i++) {
    const c = buf[i];
    if (shift === 28) {
      if (c > 0x0f) throw new ReplayFormatError("varint overflows 32 bits");
      return [(v | (c << 28)) >>> 0, i - pos + 1];
    }
    v |= (c & 0x7f) << shift;
    if (c < 0x80) return [v >>> 0, i - pos + 1];
    shift += 7;
  }
  return null;
}

export function utf8Encode(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; }
    }
    if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

export function utf8Decode(b: Uint8Array): string {
  let out = "";
  for (let i = 0; i < b.length; ) {
    const c = b[i++];
    let cp: number;
    if (c < 0x80) cp = c;
    else if (c >= 0xc0 && c < 0xe0 && i < b.length) cp = ((c & 31) << 6) | (b[i++] & 63);
    else if (c >= 0xe0 && c < 0xf0 && i + 1 < b.length) { cp = ((c & 15) << 12) | ((b[i] & 63) << 6) | (b[i + 1] & 63); i += 2; }
    else if (c >= 0xf0 && i + 2 < b.length) { cp = ((c & 7) << 18) | ((b[i] & 63) << 12) | ((b[i + 1] & 63) << 6) | (b[i + 2] & 63); i += 3; }
    else cp = 0xfffd;
    out += String.fromCodePoint(cp);
  }
  return out;
}
