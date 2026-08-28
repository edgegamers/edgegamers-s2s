import type { RankTable } from "./types.ts";

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

export const RANK_TABLE_TEMPLATE = `{
  // MAUL rank to SourceMod group mapping.
  "ranks": {
    "10": { "group": "e", "tag": "=(e)=" },
    "20": { "group": "eg", "tag": "=(eG)=" },
    "30": { "group": "ego", "tag": "=(eGO)=" },
    "31": { "group": "trainer", "special": true },
    "32": { "group": "event", "special": true },
    "50": { "group": "advisor", "tag": "=(eGO)=" },
    "60": { "group": "manager", "tag": "=(eGO)=" },
    "70": { "group": "srmanager", "tag": "=(eGO)=" },
    "90": { "group": "commgr", "tag": "=(eGO)=" },
    "91": { "group": "director", "tag": "=(eGO)=" }
  }
}`;

export function stripJsonComments(input: string): string {
  let result = "";
  let inString = false;
  let escaped = false;
  let inComment = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (inComment) {
      if (char === "\n" || char === "\r") {
        inComment = false;
        result += char;
      }
      continue;
    }
    if (inString) {
      result += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      result += char;
    } else if (char === "/" && input[index + 1] === "/") {
      inComment = true;
      index += 1;
    } else {
      result += char;
    }
  }
  return result;
}

export function parseRankTable(input: string): RankTable | null {
  try {
    const parsed: unknown = JSON.parse(stripJsonComments(input));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const ranks = (parsed as { ranks?: unknown }).ranks;
    if (ranks === null || typeof ranks !== "object" || Array.isArray(ranks)) return null;
    const output: RankTable = { ranks: {} };
    for (const [rank, rawEntry] of Object.entries(ranks)) {
      if (!/^\d+$/.test(rank) || rawEntry === null || typeof rawEntry !== "object" || Array.isArray(rawEntry)) return null;
      const entry = rawEntry as { group?: unknown; tag?: unknown; special?: unknown };
      if (typeof entry.group !== "string" || entry.group.length === 0) return null;
      if (entry.tag !== undefined && typeof entry.tag !== "string") return null;
      let special: boolean | undefined;
      if (entry.special !== undefined) {
        if (typeof entry.special === "boolean") special = entry.special;
        else if (entry.special === "1") special = true;
        else if (entry.special === "0") special = false;
        else return null;
      }
      output.ranks[rank] = { group: entry.group, ...(entry.tag === undefined ? {} : { tag: entry.tag }), ...(special === undefined ? {} : { special }) };
    }
    return Object.keys(output.ranks).length === 0 ? null : output;
  } catch {
    return null;
  }
}
