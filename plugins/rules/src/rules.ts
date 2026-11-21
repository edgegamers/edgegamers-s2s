/**
 * The rules file: configs/rules.json, written with the defaults the first time it is missing and
 * read again on every open, so an operator's edit applies without a reload.
 *
 * A section is either numbered rules or paragraphs. A rule's number is its place in its section, so
 * "general 6" is the same rule on every page and after every edit that only appends.
 */
import { config } from '@s2script/sdk';
import type { GameHudSheetSection } from '@s2script/cs2';
import { DEFAULT_RULES } from './defaults';

export const RULES_FILE = 'rules.json';

export interface RulesSection {
  id: string;
  label: string;
  group?: string;
  heading?: string;
  kicker?: string;
  rules?: string[];
  paragraphs?: string[];
}
export interface RulesFile {
  title?: string;
  /** The section `!rules` opens on. Defaults to the first one. */
  open?: string;
  sections: RulesSection[];
}

const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string');

/** Throws with a readable reason when the file is not a usable rules file. */
export function parseRules(text: string): RulesFile {
  const raw: unknown = JSON.parse(text);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('the file must hold an object');
  const file = raw as Record<string, unknown>;
  if (!Array.isArray(file.sections) || file.sections.length === 0) throw new Error('"sections" must be a non-empty list');
  const seen = new Set<string>();
  const sections = file.sections.map((s: unknown, i: number): RulesSection => {
    const at = `section ${i + 1}`;
    if (!s || typeof s !== 'object') throw new Error(`${at} must be an object`);
    const v = s as Record<string, unknown>;
    if (typeof v.id !== 'string' || !/^[a-z0-9_-]+$/i.test(v.id)) throw new Error(`${at} needs an "id" of letters, digits, - or _`);
    if (seen.has(v.id.toLowerCase())) throw new Error(`${at} repeats the id "${v.id}"`);
    seen.add(v.id.toLowerCase());
    if (typeof v.label !== 'string') throw new Error(`${at} needs a "label"`);
    if (!strings(v.rules) && !strings(v.paragraphs)) throw new Error(`${at} needs "rules" or "paragraphs" (a list of text)`);
    for (const k of ['group', 'heading', 'kicker'] as const) if (v[k] !== undefined && typeof v[k] !== 'string') throw new Error(`${at}: "${k}" must be text`);
    return {
      id: v.id, label: v.label,
      group: v.group as string | undefined, heading: v.heading as string | undefined, kicker: v.kicker as string | undefined,
      rules: strings(v.rules) ? v.rules : undefined,
      paragraphs: strings(v.rules) ? undefined : (v.paragraphs as string[]),
    };
  });
  return {
    title: typeof file.title === 'string' ? file.title : undefined,
    open: typeof file.open === 'string' ? file.open : undefined,
    sections,
  };
}

let warned: string | null = null;

/** The operator's rules, or the defaults (written once) when there is no file yet. A broken file keeps the defaults and says why once. */
export function loadRules(): RulesFile {
  const text = config.readFile(RULES_FILE);
  if (text === null) {
    config.writeFile(RULES_FILE, JSON.stringify(DEFAULT_RULES, null, 2) + '\n');
    return DEFAULT_RULES;
  }
  try {
    const file = parseRules(text);
    warned = null;
    return file;
  } catch (error) {
    const reason = String(error instanceof Error ? error.message : error);
    if (warned !== reason) { warned = reason; console.log(`[rules] configs/${RULES_FILE} is not usable (${reason}); showing the built-in rules`); }
    return DEFAULT_RULES;
  }
}

export function sheetSections(file: RulesFile): GameHudSheetSection[] {
  return file.sections.map((s) => ({
    id: s.id,
    label: s.label,
    group: s.group,
    heading: s.heading,
    kicker: s.kicker,
    meta: s.rules ? s.rules.length : undefined,
    body: s.rules ? { kind: 'list' as const, items: s.rules } : { kind: 'text' as const, paragraphs: s.paragraphs ?? [] },
  }));
}

/** A section id typed by a player, matched without case. */
export function findSection(file: RulesFile, typed: string): string | undefined {
  const want = typed.toLowerCase();
  return file.sections.find((s) => s.id.toLowerCase() === want)?.id;
}
