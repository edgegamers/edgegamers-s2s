/** Canonical Core settings with legacy aliases and the original round snapshot boundary. */
import {config} from '@s2script/sdk/config';
import {Server} from '@s2script/sdk/server';
import {createOwnerConfig,readValues,type OwnerConfig} from '../../../../packages/contracts/config.ts';
import {SPECS,CANONICAL_FIELDS} from './settings-specs';
import {readShopSetting} from '../shop/settings';
import {readBodySetting} from './body-settings';
import {readWorldSetting} from './world-settings';
let settings:OwnerConfig|null=null;
const raw=new Map<string,number|boolean|string>();
/** Initializes the single canonical owner and its legacy aliases, once per plugin load. */
export function registerCvars():void {
  disposeCvars();
  const initial=readValues([...SPECS,...CANONICAL_FIELDS],s=>s.type==='bool'?config.getBool(s.path):s.type==='string'?config.getString(s.path):s.type==='int'?config.getInt(s.path):config.getFloat(s.path));
  const next=createOwnerConfig(SPECS,initial,{
    read:()=>config.readFile('_edgegamers_ttt-core.json'),write:text=>config.writeFile('_edgegamers_ttt-core.json',text),
    register:s=>{if(!Server.registerCvar(s.name,{type:s.type,default:s.default,help:s.help,min:s.min,max:s.max}))throw Error('Core alias unavailable: '+s.name);},
    getAlias:n=>Server.getCvar(n),setAlias:(n,v)=>{if(!Server.setCvar(n,v))throw Error('Core alias mirror failed: '+n);},
    watchAlias:(n,h)=>Server.onCvarChange(n,h),log:m=>console.log(m),
  },CANONICAL_FIELDS);
  settings=next;
  for(const spec of SPECS)raw.set(spec.name,next.roundValue(spec.path));
  config.onChange(values=>next.acceptMaterialized(values));
}
export function disposeCvars():void {settings?.dispose();settings=null;}
/** Promote pending values only at the four original aggregate refresh sites. */
export function refresh():void {
  if(!settings)throw Error('Core owner settings unavailable');
  settings.refresh();
  for(const spec of SPECS)raw.set(spec.name,settings.roundValue(spec.path));
  rebuild();
}

/** A config value as a number. */
export function n(name: string): number {
  const shop = readShopSetting(name) ?? readWorldSetting(name) ?? readBodySetting(name);
  if (shop !== undefined) return typeof shop === "number" ? shop : 0;
  return (raw.get(name) as number | undefined) ?? 0;
}
/** A config value as a boolean. */
export function b(name: string): boolean {
  const shop = readShopSetting(name) ?? readWorldSetting(name) ?? readBodySetting(name);
  if (shop !== undefined) return typeof shop === "boolean" ? shop : false;
  return (raw.get(name) as boolean | undefined) ?? false;
}
/** A config value as a string. */
export function s(name: string): string {
  const shop = readShopSetting(name) ?? readWorldSetting(name) ?? readBodySetting(name);
  if (shop !== undefined) return typeof shop === "string" ? shop : "";
  return (raw.get(name) as string | undefined) ?? "";
}

/** Split a comma-separated ConVar into trimmed, non-empty parts. */
export function list(name: string): string[] {
  const text = s(name);
  if (text === "") return [];
  const out: string[] = [];
  for (const part of text.split(",")) {
    const t = part.trim();
    if (t !== "") out.push(t);
  }
  return out;
}

/**
 * The hot-path config snapshot. Fields most read during a round get a named property here so the
 * access is a plain property load rather than a `Map.get` — everything else goes through
 * {@link n}/{@link b}/{@link s}, which is still orders of magnitude cheaper than the C# original.
 */
export const cfg = {
  countdownSeconds: 15,
  minPlayers: 2,
  timeBetweenRounds: 1,
  postRoundSeconds: 5,
  roundBase: 60,
  roundPerPlayer: 15,
  roundMax: 300,
  afkSeconds: 180,
  showNames: true,
  stripOnAssign: true,
  bodiesEnabled: true,
  bodyHidePawn: true,
  bodySettle: true,
  propPickup: true,
  /** Health by {@link RoleId} index. */
  roleHealth: new Int32Array(5),
  /** Armor by {@link RoleId} index. */
  roleArmor: new Int32Array(5),
  get dnaGlow(): boolean { return b("sm_ttt_dna_glow"); },
  roleFlashSeconds: 4,
  /** Starting weapons by {@link RoleId} index. */
  roleWeapons: [[], [], [], [], []] as string[][],
};

/** Recompute the derived snapshot fields from {@link raw}. */
function rebuild(): void {
  cfg.countdownSeconds = n("sm_ttt_round_countdown");
  cfg.minPlayers = n("sm_ttt_minimum_players");
  cfg.timeBetweenRounds = n("sm_ttt_time_between_rounds");
  cfg.postRoundSeconds = n("sm_ttt_post_round_seconds");
  cfg.roundBase = n("sm_ttt_round_duration_base");
  cfg.roundPerPlayer = n("sm_ttt_round_duration_per_player");
  cfg.roundMax = n("sm_ttt_round_duration_max");
  cfg.afkSeconds = n("sm_ttt_afk_seconds");
  cfg.showNames = b("sm_ttt_show_names");
  cfg.stripOnAssign = b("sm_ttt_strip_on_assign");
  cfg.bodiesEnabled = b("sm_ttt_bodies_enabled");
  cfg.bodyHidePawn = b("sm_ttt_body_hidepawn");
  cfg.bodySettle = b("sm_ttt_body_settle");
  cfg.propPickup = b("sm_ttt_prop_pickup");

  // RoleId: 1 = Innocent, 2 = Traitor, 3 = Detective.
  cfg.roleHealth[1] = n("sm_ttt_rolehp_innocent");
  cfg.roleHealth[2] = n("sm_ttt_rolehp_traitor");
  cfg.roleHealth[3] = n("sm_ttt_rolehp_detective");
  cfg.roleArmor[1] = n("sm_ttt_rolearmor_innocent");
  cfg.roleArmor[2] = n("sm_ttt_rolearmor_traitor");
  cfg.roleArmor[3] = n("sm_ttt_rolearmor_detective");
  cfg.roleFlashSeconds = n("sm_ttt_role_flash_seconds");
  cfg.roleWeapons[1] = list("sm_ttt_roleweapons_innocent");
  cfg.roleWeapons[2] = list("sm_ttt_roleweapons_traitor");
  cfg.roleWeapons[3] = list("sm_ttt_roleweapons_detective");

}

/** Round length for a given participant count — the C# `CS2RoundConfig.RoundDuration`. */
export function roundDuration(players: number): number {
  return Math.min(cfg.roundBase + (players - 1) * cfg.roundPerPlayer, cfg.roundMax);
}
