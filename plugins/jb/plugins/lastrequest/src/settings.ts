/**
 * Config (the old `css_jb_*` FakeConVars, minus the prefix). Declared in package.json
 * `s2script.config`; re-read on `config.onChange`.
 */
import { config } from "@s2script/sdk";

export const settings = {
  // last request
  lrTimeBase: 60,
  lrTimePerLR: 20,
  lrTimePerGuard: 0,
  lrActivateAt: 2,
  maxTimeForLR: 60,
  b4bKillByHealth: true,
  raceEnabled: false,
  // LR rebel
  rebelOn: true,
  rebelWeapon: "weapon_m249",
  rebelCtMaxHp: 200,
  rebelTHpRatio: 0.7,
  rebelTMaxHp: 800,
  // last guard
  lgApplyLowerHp: false,
  lgCtHpRatio: 0.7,
  lgTimeBase: 30,
  lgTimePerKill: 10,
  lgTimeMax: 90,
  lgTimePerPrisoner: 10,
  lgTWeapon: "",
  lgMaxHp: 125,
  lgTMaxHp: 200,
  lgMinCts: 2,
};

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

export function loadSettings(): void {
  settings.lrTimeBase = config.getInt("lr_time_base");
  settings.lrTimePerLR = config.getInt("lr_time_per_lr");
  settings.lrTimePerGuard = config.getInt("lr_time_per_guard");
  settings.lrActivateAt = clamp(config.getInt("lr_activate_lr_at"), 1, 32);
  settings.maxTimeForLR = config.getInt("max_time_for_lr");
  settings.b4bKillByHealth = config.getBool("lr_b4b_kill_by_health");
  settings.raceEnabled = config.getBool("lr_race_enabled");

  settings.rebelOn = config.getBool("rebel_on");
  settings.rebelWeapon = config.getString("rebel_t_weapon") || "weapon_m249";
  settings.rebelCtMaxHp = clamp(config.getInt("rebel_ct_max_hp"), 1, 1000);
  settings.rebelTHpRatio = clamp(config.getFloat("rebel_t_hp_ratio"), 0.00001, 10);
  settings.rebelTMaxHp = clamp(config.getInt("rebel_t_max_hp"), 1, 1000);

  settings.lgApplyLowerHp = config.getBool("lg_apply_lower_hp");
  settings.lgCtHpRatio = clamp(config.getFloat("lg_ct_hp_ratio"), 0.00001, 10);
  settings.lgTimeBase = config.getInt("lg_time_base");
  settings.lgTimePerKill = config.getInt("lg_time_per_kill");
  settings.lgTimeMax = config.getInt("lg_time_max");
  settings.lgTimePerPrisoner = config.getInt("lg_time_per_prisoner");
  settings.lgTWeapon = config.getString("lg_t_weapon");
  settings.lgMaxHp = clamp(config.getInt("lg_max_hp"), 1, 1000);
  settings.lgTMaxHp = clamp(config.getInt("lg_t_max_hp"), 1, 1000);
  settings.lgMinCts = clamp(config.getInt("lg_min_cts"), 1, 32);
}
