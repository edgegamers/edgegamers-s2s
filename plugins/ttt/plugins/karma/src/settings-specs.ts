import type {AliasSpec} from '../../../packages/contracts/config.ts';
/** Exact old names/defaults/bounds; metadata checked against this owner's manifest. */
export const SPECS: readonly AliasSpec[] = [
  {
    "name": "sm_ttt_karma_db_string",
    "path": "databaseConnection",
    "type": "string",
    "default": "karma",
    "help": "Database connection name for karma storage"
  },
  {
    "name": "sm_ttt_karma_default",
    "path": "defaultKarma",
    "type": "int",
    "default": 50,
    "help": "Default karma for new or reset players",
    "min": 0,
    "max": 1000
  },
  {
    "name": "sm_ttt_karma_min",
    "path": "minimumKarma",
    "type": "int",
    "default": 0,
    "help": "Minimum karma; below this the low-karma command runs",
    "min": 0,
    "max": 1000
  },
  {
    "name": "sm_ttt_karma_low_command",
    "path": "lowKarmaCommand",
    "type": "string",
    "default": "sm_ban #{0} 2880 Low Karma",
    "help": "Command run when karma falls below the minimum ({0} = user id)",
    "preserveBlank": true
  },
  {
    "name": "sm_ttt_karma_timeout_threshold",
    "path": "timeoutThreshold",
    "type": "int",
    "default": 20,
    "help": "Karma below which a player sits out",
    "min": 0,
    "max": 1000
  },
  {
    "name": "sm_ttt_karma_round_timeout",
    "path": "timeoutRounds",
    "type": "int",
    "default": 4,
    "help": "Rounds a low-karma player sits out",
    "min": 0,
    "max": 100
  },
  {
    "name": "sm_ttt_karma_warning_window_hours",
    "path": "warningWindowHours",
    "type": "int",
    "default": 24,
    "help": "Hours between repeat karma warnings",
    "min": 0,
    "max": 720
  },
  {
    "name": "sm_ttt_karma_per_round",
    "path": "perRound",
    "type": "int",
    "default": 1,
    "help": "Karma gained per round played",
    "min": -100,
    "max": 100
  },
  {
    "name": "sm_ttt_karma_per_round_win",
    "path": "perRoundWin",
    "type": "int",
    "default": 1,
    "help": "Karma gained per round won",
    "min": -100,
    "max": 100
  },
  {
    "name": "sm_ttt_karma_inno_on_traitor",
    "path": "scoring.innocentOnTraitor",
    "type": "int",
    "default": 3,
    "help": "Karma for a non-Traitor killing a Traitor",
    "min": -100,
    "max": 100
  },
  {
    "name": "sm_ttt_karma_traitor_on_detective",
    "path": "scoring.traitorOnDetective",
    "type": "int",
    "default": 1,
    "help": "Karma for a Traitor killing a Detective",
    "min": -100,
    "max": 100
  },
  {
    "name": "sm_ttt_karma_inno_on_inno_innocent",
    "path": "scoring.innocentOnInnocent.killerInnocent",
    "type": "int",
    "default": 0,
    "help": "Inno kills Inno, retaliating",
    "min": -100,
    "max": 100
  },
  {
    "name": "sm_ttt_karma_inno_on_inno_guilty",
    "path": "scoring.innocentOnInnocent.killerGuilty",
    "type": "int",
    "default": -4,
    "help": "Inno kills Inno, unprovoked",
    "min": -100,
    "max": 100
  },
  {
    "name": "sm_ttt_karma_inno_on_inno_victim_innocent",
    "path": "scoring.innocentOnInnocent.victimInnocent",
    "type": "int",
    "default": 1,
    "help": "Inno victim, killer unprovoked",
    "min": -100,
    "max": 100
  },
  {
    "name": "sm_ttt_karma_inno_on_inno_victim_guilty",
    "path": "scoring.innocentOnInnocent.victimGuilty",
    "type": "int",
    "default": -2,
    "help": "Inno victim, they started it",
    "min": -100,
    "max": 100
  },
  {
    "name": "sm_ttt_karma_traitor_on_traitor_innocent",
    "path": "scoring.traitorOnTraitor.killerInnocent",
    "type": "int",
    "default": -3,
    "help": "Traitor kills Traitor, retaliating",
    "min": -100,
    "max": 100
  },
  {
    "name": "sm_ttt_karma_traitor_on_traitor_guilty",
    "path": "scoring.traitorOnTraitor.killerGuilty",
    "type": "int",
    "default": -5,
    "help": "Traitor kills Traitor, unprovoked",
    "min": -100,
    "max": 100
  },
  {
    "name": "sm_ttt_karma_traitor_on_traitor_victim_innocent",
    "path": "scoring.traitorOnTraitor.victimInnocent",
    "type": "int",
    "default": 1,
    "help": "Traitor victim, killer unprovoked",
    "min": -100,
    "max": 100
  },
  {
    "name": "sm_ttt_karma_traitor_on_traitor_victim_guilty",
    "path": "scoring.traitorOnTraitor.victimGuilty",
    "type": "int",
    "default": -2,
    "help": "Traitor victim, they started it",
    "min": -100,
    "max": 100
  },
  {
    "name": "sm_ttt_karma_inno_on_detective_innocent",
    "path": "scoring.innocentOnDetective.killerInnocent",
    "type": "int",
    "default": -4,
    "help": "Inno kills Detective, retaliating",
    "min": -100,
    "max": 100
  },
  {
    "name": "sm_ttt_karma_inno_on_detective_guilty",
    "path": "scoring.innocentOnDetective.killerGuilty",
    "type": "int",
    "default": -6,
    "help": "Inno kills Detective, unprovoked",
    "min": -100,
    "max": 100
  },
  {
    "name": "sm_ttt_karma_inno_on_detective_victim_innocent",
    "path": "scoring.innocentOnDetective.victimInnocent",
    "type": "int",
    "default": 1,
    "help": "Detective victim, killer unprovoked",
    "min": -100,
    "max": 100
  },
  {
    "name": "sm_ttt_karma_inno_on_detective_victim_guilty",
    "path": "scoring.innocentOnDetective.victimGuilty",
    "type": "int",
    "default": -1,
    "help": "Detective victim, they started it",
    "min": -100,
    "max": 100
  }
];
