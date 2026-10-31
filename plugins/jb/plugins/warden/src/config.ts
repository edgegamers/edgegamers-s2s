import { config } from "@s2script/sdk";

/**
 * Every tunable, read from the plugin config (declared under `s2script.config` in package.json —
 * the old `css_jb_*` FakeConVars minus the prefix). Re-read on load and on `config.onChange`.
 */
export const cfg = {
  // warden perks (WardenBehavior)
  hpEqual: 50,
  hpOutnumber: 25,
  hpOutnumbered: 100,
  wardenArmor: 125,
  wardenHp: 125,
  wardenMaxHp: 100,
  wardenTRatio: 3,
  soundKilled: "jb/warden/wardenkilled.vsnd",
  soundPassed: "jb/warden/wardenpassed.vsnd",
  soundNew: "jb/warden/wardennew.vsnd",
  // selection
  queueSeconds: 7,
  autoWardenFlag: "o",
  autoWardenDelay: 5,
  // commands
  openCooldown: 25,
  countCooldown: 30,
  countdownMin: 3,
  countdownMax: 15,
  countdownDefault: 5,
  peaceCooldown: 60,
  maxChickens: 5,
  maxSoccers: 3,
  // markers + paint
  markerFlag: "o",
  markerMinRadius: 60,
  markerMaxRadius: 360,
  markerResizeMs: 800,
  markerSegments: 33,
  paintLifetime: 10,
  paintMaxSegments: 300,
};

function has(key: string): boolean {
  return config.getString(key) !== "";
}
const int = (key: string, def: number): number => (has(key) ? config.getInt(key) : def);
const float = (key: string, def: number): number => (has(key) ? config.getFloat(key) : def);
const bool = (key: string, def: boolean): boolean => (has(key) ? config.getBool(key) : def);
const str = (key: string, def: string): string => (has(key) ? config.getString(key) : def);
const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

export function loadConfig(): void {
  cfg.hpEqual = clamp(int("hp_equal", 50), 1, 200);
  cfg.hpOutnumber = clamp(int("hp_outnumber", 25), 1, 200);
  cfg.hpOutnumbered = clamp(int("hp_outnumbered", 100), 1, 200);
  cfg.wardenArmor = clamp(int("warden_armor", 125), 1, 200);
  cfg.wardenHp = clamp(int("warden_hp", 125), 1, 200);
  cfg.wardenMaxHp = clamp(int("warden_maxhp", 100), 1, 200);
  cfg.wardenTRatio = int("warden_t_ratio", 3);
  cfg.soundKilled = str("warden_sound_killed", "jb/warden/wardenkilled.vsnd");
  cfg.soundPassed = str("warden_sound_passed", "jb/warden/wardenpassed.vsnd");
  cfg.soundNew = str("warden_sound_new", "jb/warden/wardennew.vsnd");
  cfg.queueSeconds = Math.max(1, float("warden_queue_seconds", 7));
  cfg.autoWardenFlag = str("autowarden_flag", "o");
  cfg.autoWardenDelay = Math.max(0, float("autowarden_delay_interval", 5));
  cfg.openCooldown = clamp(int("warden_open_cooldown", 25), 0, 300);
  cfg.countCooldown = clamp(int("warden_count_cooldown", 30), 0, 300);
  cfg.countdownMin = int("warden_countdown_min", 3);
  cfg.countdownMax = int("warden_countdown_max", 15);
  cfg.countdownDefault = int("warden_countdown_default", 5);
  cfg.peaceCooldown = Math.max(0, int("peace_cooldown", 60));
  cfg.maxChickens = int("max_chickens", 5);
  cfg.maxSoccers = int("max_soccers", 3);
  cfg.markerFlag = str("marker_customization_flag", "o");
  cfg.markerMinRadius = float("warden_marker_min_radius", 60);
  cfg.markerMaxRadius = float("warden_marker_max_radius", 360);
  cfg.markerResizeMs = int("warden_resize_time", 800);
  cfg.markerSegments = clamp(int("warden_marker_segments", 33), 16, 256);
  cfg.paintLifetime = Math.max(1, float("warden_paint_lifetime", 10));
  cfg.paintMaxSegments = clamp(int("warden_paint_max_segments", 300), 10, 2000);
}
