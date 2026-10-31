// src/rank-table.ts — the ranks table's default, template, and parser. PURE: zero I/O, zero SDK
// imports (the SDK ships types only, so anything it touches is untestable). Unit-test target.

import type { RankEntry, RankTable } from "./types.ts";

/** The ranks table, ported from sm/maul/configs/maul/authentication.cfg. */
export const DEFAULT_RANK_TABLE: RankTable = {
  ranks: {
    "10": { group: "e", tag: "=(e)=" },
    "20": { group: "eg", tag: "=(eG)=" },
    "30": { group: "ego", tag: "=(eGO)=" },
    "31": { group: "trainer", special: true },
    "32": { group: "event", special: true },
    "50": { group: "advisor", tag: "=(eGO)=" },
    "60": { group: "manager", tag: "=(eGO)=" },
    "70": { group: "srmanager", tag: "=(eGO)=" },
    "90": { group: "commgr", tag: "=(eGO)=" },
    "91": { group: "director", tag: "=(eGO)=" },
  },
};

/** Written to configs/maul_authentication.json on first load. MUST parse to DEFAULT_RANK_TABLE. */
export const RANK_TABLE_TEMPLATE = `{
  // MAUL rank -> admin group + name tag. Ported from sm/maul/configs/maul/authentication.cfg.
  //
  //   "group"   - a group name defined in the SERVER's admin_groups.json. Flags and immunity come
  //               from there; a name missing from that file is warned about once and skipped.
  //   "tag"     - the name tag for this rank. Applied to the PRIMARY rank only, as "<tag> <name>".
  //   "special" - event-gated: only granted when the plugin's "eventserver" config is true.
  //
  // Rank 95 additionally inherits the "root" group. DS tiers inherit donator_tier1..N.
  // A malformed edit keeps the last-good table rather than dropping every rank.
  "ranks": {
    "10": { "group": "e",         "tag": "=(e)="   },
    "20": { "group": "eg",        "tag": "=(eG)="  },
    "30": { "group": "ego",       "tag": "=(eGO)=" },
    "31": { "group": "trainer",   "special": true  },
    "32": { "group": "event",     "special": true  },
    "50": { "group": "advisor",   "tag": "=(eGO)=" },
    "60": { "group": "manager",   "tag": "=(eGO)=" },
    "70": { "group": "srmanager", "tag": "=(eGO)=" },
    "90": { "group": "commgr",    "tag": "=(eGO)=" },
    "91": { "group": "director",  "tag": "=(eGO)=" }
  }
}
`;

/** Remove `//` line comments outside string literals — the ops template is commented JSON. */
export function stripJsonComments(text: string): string {
  let out = "";
  let inString = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;

    if (inString) {
      out += ch;
      if (ch === "\\" && i + 1 < text.length) {
        out += text[i + 1];
        i++;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }

    if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      i--; // the loop increment lands us back on the newline
      continue;
    }

    out += ch;
  }

  return out;
}

/** Parse and validate a ranks table. Returns null on any malformed input (caller keeps last-good). */
export function parseRankTable(text: string): RankTable | null {
  let raw: unknown;
  try {
    raw = JSON.parse(stripJsonComments(text));
  } catch {
    return null;
  }

  if (typeof raw !== "object" || raw === null) return null;
  const doc = raw as { ranks?: unknown };
  if (typeof doc.ranks !== "object" || doc.ranks === null || Array.isArray(doc.ranks)) return null;

  const ranks: Record<string, RankEntry> = {};

  for (const [key, value] of Object.entries(doc.ranks as Record<string, unknown>)) {
    if (!/^\d+$/.test(key)) return null;
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;

    const entry = value as { group?: unknown; tag?: unknown; special?: unknown };
    if (typeof entry.group !== "string" || entry.group.trim().length === 0) return null;
    if (entry.tag !== undefined && typeof entry.tag !== "string") return null;
    // Accept SM's "1"/"0" strings alongside JSON booleans.
    if (
      entry.special !== undefined &&
      typeof entry.special !== "boolean" &&
      entry.special !== "1" &&
      entry.special !== "0"
    ) {
      return null;
    }

    ranks[key] = {
      group: entry.group.trim(),
      ...(typeof entry.tag === "string" ? { tag: entry.tag } : {}),
      ...(entry.special !== undefined
        ? { special: entry.special === true || entry.special === "1" }
        : {}),
    };
  }

  return { ranks };
}
