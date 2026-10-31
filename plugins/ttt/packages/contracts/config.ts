/** Pure per-instance owner configuration and legacy alias adapter. No shared state. */
export type Value = number | boolean | string | { [key: string]: Value };
export type Values = { [key: string]: Value };
export interface ConfigField {
  readonly path: string; readonly type: 'int' | 'float' | 'bool' | 'string';
  readonly default: number | boolean | string; readonly min?: number; readonly max?: number;
}
export interface AliasSpec extends ConfigField {
  readonly name: string; readonly help: string; readonly preserveBlank?: boolean;
}
export interface ConfigIO {
  read(): string | null;
  write(content: string): void;
  register(spec: AliasSpec): void;
  getAlias(name: string): string;
  setAlias(name: string, value: string): void;
  watchAlias(name: string, handler: (name: string, next: string, previous: string) => void): {dispose():void};
  log(message: string): void;
}
export function copyValues(values: Values): Values { return JSON.parse(JSON.stringify(values)) as Values; }
function get(values: Values, path: string): Value | undefined {
  let value: Value = values;
  for (const part of path.split('.')) {
    if (value === null || typeof value !== 'object' || Array.isArray(value) || !Object.prototype.hasOwnProperty.call(value, part)) return undefined;
    value = value[part]!;
  }
  return value;
}
function set(values: Values, path: string, value: number | boolean | string): void {
  const parts = path.split('.'); let target = values;
  for (const part of parts.slice(0, -1)) {
    if (typeof target[part] !== 'object') target[part] = {};
    target = target[part] as Values;
  }
  target[parts[parts.length - 1]!] = value;
}
/** The SDK accepts quote-aware line comments, not trailing commas or block comments. */
function stripComments(text: string): string {
  const lines = text.split('\n').map(line => {
    let quoted = false, escaped = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (quoted) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quoted = false; }
      else if (char === '"') quoted = true;
      else if (char === '/' && line[i + 1] === '/') return line.slice(0, i);
    }
    return line;
  });
  return lines.join('\n');
}
export function parseJsonc(text: string): unknown { return JSON.parse(stripComments(text)) as unknown; }
/** Rust serde_json keeps floating numeric tokens distinct even when their value is integral. */
export function materializeJsonc(specs: readonly ConfigField[], text: string): Values {
  const clean = stripComments(text), parsed = JSON.parse(clean, (_key, value: unknown) => {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('JSON number out of range');
    return value;
  }) as unknown;
  const integerView = JSON.parse(clean.replace(/"(?:[^"\\]|\\.)*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/g, token => token.startsWith('"') || (!/[.eE]/.test(token) && token !== '-0') ? token : 'null')) as Values;
  const result = normalizeValues(specs, parsed);
  for (const spec of specs) if (spec.type === 'int' && !valid(get(integerView, spec.path), spec)) set(result, spec.path, spec.default);
  return result;
}
function valid(value: Value | undefined, spec: ConfigField): value is number | boolean | string {
  if (spec.type === 'string') return typeof value === 'string';
  if (spec.type === 'bool') return typeof value === 'boolean';
  return typeof value === 'number' && Number.isFinite(value) && (spec.type !== 'int' || Number.isInteger(value))
    && (spec.min === undefined || value >= spec.min) && (spec.max === undefined || value <= spec.max);
}
/** Same type/range/default policy as SDK materialization; unknown keys are not settings. */
export function normalizeValues(specs: readonly ConfigField[], input: unknown): Values {
  const source = input !== null && typeof input === 'object' && !Array.isArray(input) ? input as Values : {};
  const output: Values = {};
  for (const spec of specs) { const value = get(source, spec.path); set(output, spec.path, valid(value, spec) ? value : spec.default); }
  return output;
}
export function readValues(specs: readonly ConfigField[], read: (spec: ConfigField) => number | boolean | string): Values {
  const values: Values = {}; for (const spec of specs) set(values, spec.path, read(spec)); return values;
}
export function parseLegacy(spec: AliasSpec, text: string): number | boolean | string {
  if (spec.type === 'bool') return text === '' ? spec.default : text !== '0' && text.toLowerCase() !== 'false';
  if (spec.type === 'string') return text === '' && !spec.preserveBlank ? spec.default : text;
  const value = text === '' ? NaN : spec.type === 'int' ? parseInt(text, 10) : parseFloat(text);
  if (!Number.isFinite(value)) return spec.default;
  return Math.min(spec.max ?? Infinity, Math.max(spec.min ?? -Infinity, value));
}
export function serializeValues(values: Values): string {
  return '// Canonical owner settings. Legacy aliases write through to this file.\n' + JSON.stringify(values, null, 2) + '\n';
}
export interface OwnerConfig {
  getRound(): Values;
  roundValue(path: string): number | boolean | string;
  liveValue(path: string): number | boolean | string;
  refresh(): Values;
  acceptMaterialized(values: unknown): void;
  dispose(): void;
}
export function createOwnerConfig(specs: readonly AliasSpec[], initial: unknown, io: ConfigIO, canonicalOnly: readonly ConfigField[] = []): OwnerConfig {
  const fields: readonly ConfigField[] = [...specs, ...canonicalOnly];
  const paths = new Set<string>();
  for (const field of fields) {
    if (paths.has(field.path)) throw new Error(`Duplicate canonical config path: ${field.path}`);
    paths.add(field.path);
  }
  let pending = normalizeValues(fields, initial), active = copyValues(pending), closed = false, mirroring = false;
  let acceptedBytes: string | null | undefined;
  const subscriptions: {dispose():void}[] = [];
  const mirrored = new Map<string, string>();
  const log = (text: string): void => { try { io.log(`[ttt] owner config: ${text}`); } catch { /* diagnostics cannot change config */ } };
  function diskValues(bytes: string | null): Values { try { return bytes === null ? normalizeValues(fields, {}) : materializeJsonc(fields, bytes); } catch { return normalizeValues(fields, {}); } }
  function matches(bytes: string | null, values: Values): boolean { return JSON.stringify(diskValues(bytes)) === JSON.stringify(values); }
  const initialBytes = io.read();
  acceptedBytes = matches(initialBytes, pending) ? initialBytes : undefined;
  function assertOpen(): void { if (closed) throw new Error('Owner settings unavailable after disposal'); }
  function scalar(values: Values, path: string): number | boolean | string {
    const value = get(values, path); if (typeof value !== 'number' && typeof value !== 'string' && typeof value !== 'boolean') throw new Error(`Unknown owner setting: ${path}`); return value;
  }
  function mirror(spec: AliasSpec): void {
    const text = String(scalar(pending, spec.path));
    if (io.getAlias(spec.name) === text) return;
    mirroring = true;
    try { io.setAlias(spec.name, text); mirrored.set(spec.name, io.getAlias(spec.name)); } finally { mirroring = false; }
  }
  function changed(spec: AliasSpec): void {
    if (closed || mirroring) return;
    // Native notifications may be deferred and float payloads use a different
    // rendering than getCvar. Read the current alias, never the queued payload.
    // Record the actual post-mirror rendering so an echo cannot round a precise
    // canonical float or rewrite operator comments.
    const next = io.getAlias(spec.name);
    if (mirrored.get(spec.name) === next) return;
    mirrored.delete(spec.name);
    const normalized = parseLegacy(spec, next);
    if (normalized === scalar(pending, spec.path)) { mirror(spec); return; }
    const before = io.read();
    if (acceptedBytes === undefined || before !== acceptedBytes) { log(`unseen canonical edit; refused alias ${spec.name}`); mirror(spec); return; }
    const candidate = copyValues(pending); set(candidate, spec.path, normalized);
    const content = serializeValues(candidate);
    try { io.write(content); }
    catch (error) { log(`persistence failure for ${spec.name}: ${String(error)}`); mirror(spec); return; }
    if (io.read() !== content) { log(`persistence readback failure for ${spec.name}`); mirror(spec); return; }
    pending = candidate; acceptedBytes = content; mirror(spec);
  }
  try {
    for (const spec of specs) { io.register(spec); subscriptions.push(io.watchAlias(spec.name, () => changed(spec))); mirror(spec); }
  } catch (error) { for (const subscription of subscriptions) subscription.dispose(); throw error; }
  return {
    getRound() { assertOpen(); return copyValues(active); },
    roundValue(path) { assertOpen(); return scalar(active, path); },
    liveValue(path) { assertOpen(); return scalar(pending, path); },
    refresh() { assertOpen(); active = copyValues(pending); return copyValues(active); },
    acceptMaterialized(values) {
      if (closed) return;
      const candidate = normalizeValues(fields, values), bytes = io.read();
      // A loader read begun before an alias write must not undo the accepted newer value.
      if (!matches(bytes, candidate)) { log('stale materialization ignored; disk differs from callback'); return; }
      pending = candidate; acceptedBytes = bytes;
      for (const spec of specs) mirror(spec);
    },
    dispose() { if (closed) return; closed = true; for (const subscription of subscriptions) subscription.dispose(); },
  };
}
