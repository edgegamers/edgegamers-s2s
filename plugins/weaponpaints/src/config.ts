// Settings, ported from WeaponPaints 3.3a (Config.cs). GPL-3.0-only. See LICENSE and NOTICE.
//
// Declared under `s2script.config` in package.json. Database credentials are not here: the
// connection named "weaponpaints" in s2script's databases.json replaces Database* settings.
import { config } from '@s2script/sdk';

export interface Settings {
  skinsLanguage: string;
  cooldownSeconds: number;
  website: string;
  knifeEnabled: boolean;
  gloveEnabled: boolean;
  musicEnabled: boolean;
  agentEnabled: boolean;
  skinEnabled: boolean;
  pinsEnabled: boolean;
  commandWpEnabled: boolean;
  commandKillEnabled: boolean;
  giveRandomSkin: boolean;
  showSkinImage: boolean;
  menuType: string;
  commands: {
    knife: string[]; music: string[]; pin: string[]; glove: string[]; agent: string[];
    statTrak: string[]; skin: string[]; skinSelection: string[]; refresh: string[]; kill: string[];
  };
}

/** `"pin, pins;coin"` -> ["pin", "pins", "coin"]; drops anything that is not a plain command word. */
export function aliases(value: string): string[] {
  const names: string[] = [];
  for (const raw of value.split(/[,;\s]+/)) {
    const name = raw.trim().toLowerCase().replace(/^(css_|sm_|!|\/)/, '');
    if (/^[a-z0-9_]+$/.test(name) && !names.includes(name)) names.push(name);
  }
  return names;
}

export function readSettings(): Settings {
  const language = config.getString('skins_language').trim().toLowerCase();
  return {
    skinsLanguage: /^[a-z0-9_-]+$/.test(language) ? language : 'en',
    cooldownSeconds: Math.max(0, config.getInt('cmd_refresh_cooldown_seconds')),
    website: config.getString('website'),
    knifeEnabled: config.getBool('knife_enabled'),
    gloveEnabled: config.getBool('glove_enabled'),
    musicEnabled: config.getBool('music_enabled'),
    agentEnabled: config.getBool('agent_enabled'),
    skinEnabled: config.getBool('skin_enabled'),
    pinsEnabled: config.getBool('pins_enabled'),
    commandWpEnabled: config.getBool('command_wp_enabled'),
    commandKillEnabled: config.getBool('command_kill_enabled'),
    giveRandomSkin: config.getBool('give_random_skin'),
    showSkinImage: config.getBool('show_skin_image'),
    menuType: config.getString('menu_type').trim().toLowerCase(),
    commands: {
      knife: aliases(config.getString('command_knife')),
      music: aliases(config.getString('command_music')),
      pin: aliases(config.getString('command_pin')),
      glove: aliases(config.getString('command_glove')),
      agent: aliases(config.getString('command_agent')),
      statTrak: aliases(config.getString('command_stattrak')),
      skin: aliases(config.getString('command_skin')),
      skinSelection: aliases(config.getString('command_skin_selection')),
      refresh: aliases(config.getString('command_refresh')),
      kill: aliases(config.getString('command_kill')),
    },
  };
}
