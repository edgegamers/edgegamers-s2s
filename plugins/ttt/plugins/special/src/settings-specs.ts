import type {AliasSpec} from '../../../packages/contracts/config.ts';
/** Exact old names/defaults/bounds; metadata checked against this owner's manifest. */
export const SPECS: readonly AliasSpec[] = [
  {
    "name": "sm_ttt_special_min_rounds_between",
    "path": "selection.minimumRoundsBetween",
    "type": "int",
    "default": 3,
    "help": "Minimum rounds between special rounds",
    "min": 0,
    "max": 100
  },
  {
    "name": "sm_ttt_special_min_players",
    "path": "selection.minimumPlayers",
    "type": "int",
    "default": 5,
    "help": "Minimum players for a special round",
    "min": 0,
    "max": 64
  },
  {
    "name": "sm_ttt_special_min_rounds_after_map",
    "path": "selection.minimumRoundsAfterMap",
    "type": "int",
    "default": 2,
    "help": "Rounds after a map change before a special",
    "min": 0,
    "max": 100
  },
  {
    "name": "sm_ttt_special_chance",
    "path": "selection.chance",
    "type": "float",
    "default": 0.2,
    "help": "Chance of a special round",
    "min": 0,
    "max": 1
  },
  {
    "name": "sm_ttt_special_multi_chance",
    "path": "selection.additionalRoundChance",
    "type": "float",
    "default": 0.33,
    "help": "Chance of stacking another special round",
    "min": 0,
    "max": 1
  },
  {
    "name": "sm_ttt_special_lowgrav_multiplier",
    "path": "lowGravity.multiplier",
    "type": "float",
    "default": 0.5,
    "help": "Gravity multiplier for the Low Grav round",
    "min": 0.05,
    "max": 1
  },
  {
    "name": "sm_ttt_special_speed_initial",
    "path": "speed.initialSeconds",
    "type": "int",
    "default": 40,
    "help": "Speed round initial seconds",
    "min": 5,
    "max": 600
  },
  {
    "name": "sm_ttt_special_speed_per_kill",
    "path": "speed.secondsPerKill",
    "type": "int",
    "default": 8,
    "help": "Speed round seconds added per kill",
    "min": 0,
    "max": 120
  },
  {
    "name": "sm_ttt_special_speed_max",
    "path": "speed.maximumSeconds",
    "type": "int",
    "default": 90,
    "help": "Speed round maximum seconds",
    "min": 10,
    "max": 600
  },
  {
    "name": "sm_ttt_special_rich_bonus_multiplier",
    "path": "rich.startingCreditMultiplier",
    "type": "float",
    "default": 2,
    "help": "Rich round starting-credit multiplier",
    "min": 1,
    "max": 10
  },
  {
    "name": "sm_ttt_special_rich_gain_multiplier",
    "path": "rich.earnedCreditMultiplier",
    "type": "float",
    "default": 3,
    "help": "Rich round in-round gain multiplier",
    "min": 1,
    "max": 10
  }
];
