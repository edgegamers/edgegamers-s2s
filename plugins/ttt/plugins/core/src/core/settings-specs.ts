import type {AliasSpec, ConfigField} from '../../../../packages/contracts/config.ts';
/** Exact existing alias metadata; canonical values are owned by this plugin. */
export const SPECS: readonly AliasSpec[] = [
  {
    "name": "sm_ttt_round_countdown",
    "path": "round.countdownSeconds",
    "type": "int",
    "default": 15,
    "help": "Time to wait before starting a round",
    "min": 1,
    "max": 60
  },
  {
    "name": "sm_ttt_minimum_players",
    "path": "round.minimumPlayers",
    "type": "int",
    "default": 2,
    "help": "Minimum number of players to start a round",
    "min": 2,
    "max": 64
  },
  {
    "name": "sm_ttt_round_duration_base",
    "path": "round.baseSeconds",
    "type": "int",
    "default": 60,
    "help": "Base round duration in seconds",
    "min": 30,
    "max": 600
  },
  {
    "name": "sm_ttt_round_duration_per_player",
    "path": "round.secondsPerPlayer",
    "type": "int",
    "default": 15,
    "help": "Extra round seconds per player",
    "min": 0,
    "max": 60
  },
  {
    "name": "sm_ttt_round_duration_max",
    "path": "round.maximumSeconds",
    "type": "int",
    "default": 300,
    "help": "Maximum round duration in seconds",
    "min": 60,
    "max": 600
  },
  {
    "name": "sm_ttt_time_between_rounds",
    "path": "round.timeBetweenRounds",
    "type": "int",
    "default": 1,
    "help": "Time to wait between rounds in seconds",
    "min": 1,
    "max": 60
  },
  {
    "name": "sm_ttt_post_round_seconds",
    "path": "round.postRoundSeconds",
    "type": "int",
    "default": 5,
    "help": "Seconds of free roam after a round ends, before the respawn",
    "min": 1,
    "max": 30
  },
  {
    "name": "sm_ttt_rolehp_traitor",
    "path": "roles.traitor.health",
    "type": "int",
    "default": 100,
    "help": "Traitor starting health",
    "min": 1,
    "max": 1000
  },
  {
    "name": "sm_ttt_rolehp_detective",
    "path": "roles.detective.health",
    "type": "int",
    "default": 100,
    "help": "Detective starting health",
    "min": 1,
    "max": 1000
  },
  {
    "name": "sm_ttt_rolehp_innocent",
    "path": "roles.innocent.health",
    "type": "int",
    "default": 100,
    "help": "Innocent starting health",
    "min": 1,
    "max": 1000
  },
  {
    "name": "sm_ttt_rolearmor_traitor",
    "path": "roles.traitor.armor",
    "type": "int",
    "default": 0,
    "help": "Traitor starting armor",
    "min": 0,
    "max": 1000
  },
  {
    "name": "sm_ttt_rolearmor_detective",
    "path": "roles.detective.armor",
    "type": "int",
    "default": 0,
    "help": "Detective starting armor",
    "min": 0,
    "max": 1000
  },
  {
    "name": "sm_ttt_rolearmor_innocent",
    "path": "roles.innocent.armor",
    "type": "int",
    "default": 0,
    "help": "Innocent starting armor",
    "min": 0,
    "max": 1000
  },
  {
    "name": "sm_ttt_roleweapons_traitor",
    "path": "roles.traitor.weapons",
    "type": "string",
    "default": "",
    "help": "Traitor starting weapons (comma-separated)"
  },
  {
    "name": "sm_ttt_roleweapons_detective",
    "path": "roles.detective.weapons",
    "type": "string",
    "default": "weapon_taser,weapon_m4a1_silencer,weapon_revolver",
    "help": "Detective starting weapons (comma-separated)"
  },
  {
    "name": "sm_ttt_roleweapons_innocent",
    "path": "roles.innocent.weapons",
    "type": "string",
    "default": "",
    "help": "Innocent starting weapons (comma-separated)"
  },
  {
    "name": "sm_ttt_role_flash_seconds",
    "path": "feedback.roleFlashSeconds",
    "type": "int",
    "default": 4,
    "help": "Seconds the role-colour screen wash lasts (0 = off)",
    "min": 0,
    "max": 30
  },
  {
    "name": "sm_ttt_afk_seconds",
    "path": "players.afkSeconds",
    "type": "int",
    "default": 180,
    "help": "Seconds before an unmoved player is moved to spectator (0 = never)",
    "min": 0,
    "max": 600
  },
  {
    "name": "sm_ttt_show_names",
    "path": "feedback.showNames",
    "type": "bool",
    "default": true,
    "help": "Show the name of the player you are looking at"
  },
  {
    "name": "sm_ttt_strip_on_assign",
    "path": "loadout.stripOnAssign",
    "type": "bool",
    "default": true,
    "help": "Strip primaries/utility (keep knife + pistol) at round end and on spawn"
  }
];

/** Existing SDK-only translation path; intentionally has no legacy ConVar. */
export const CANONICAL_FIELDS: readonly ConfigField[] = [{path:'phrases_file',type:'string',default:''}];
