// Port of edgegamers/CS2-HidePlayers (GPL-3.0), adapted 2026-10-11.
import { config } from '@s2script/sdk';

export const CONFIG_FILE = 'HidePlayers.json';
export const DEFAULT_CONFIG = {
  cmds: 'css_hidemodels;css_hide',
  who_hidden: '@all',
  ConfigVersion: 3,
};
export type HideMode = '@all' | '@team' | '@enemy';
export interface HideConfig { cmds: string; mode: HideMode; }

export function readConfig(): HideConfig {
  let text = config.readFile(CONFIG_FILE);
  if (text === null) {
    text = JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n';
    config.writeFile(CONFIG_FILE, text);
  }
  const raw: unknown = JSON.parse(text);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('HidePlayers.json must contain an object');
  }
  const values = { ...DEFAULT_CONFIG, ...raw };
  if (typeof values.cmds !== 'string' || typeof values.who_hidden !== 'string' ||
      !Number.isInteger(values.ConfigVersion)) {
    throw new Error('cmds and who_hidden must be strings; ConfigVersion must be an integer');
  }
  if (values.ConfigVersion < DEFAULT_CONFIG.ConfigVersion) {
    console.log(`[HidePlayers] Your config version is outdated. (v. ${values.ConfigVersion} -> 3)`);
  }
  return {
    cmds: values.cmds,
    mode: values.who_hidden === '@team' || values.who_hidden === '@enemy' ? values.who_hidden : '@all',
  };
}

export function commandNames(commands: string): Set<string> {
  const names = new Set<string>();
  for (const entry of commands.split(';')) {
    const name = entry.trim();
    if (!name) continue;
    if (!/^[a-zA-Z0-9_]+$/.test(name)) throw new Error(`Invalid hide command: ${name}`);
    names.add(name);
    // s2script's chat router strips sm_, but not CounterStrikeSharp's css_.
    if (name.startsWith('css_') && name.length > 4) names.add(name.slice(4));
  }
  return names;
}
