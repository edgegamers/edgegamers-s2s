import type {AliasSpec} from '../../../packages/contracts/config.ts';
/** Exact existing alias metadata; canonical values are owned by this plugin. */
export const SPECS: readonly AliasSpec[] = [
  {
    "name": "sm_ttt_role_panels",
    "path": "rolePanels",
    "type": "bool",
    "default": false,
    "help": "Floating worldtext role panels above marked players"
  },
  {
    "name": "sm_ttt_role_glow_seconds",
    "path": "roleGlowSeconds",
    "type": "int",
    "default": 0,
    "help": "Seconds the role glow stays up (0 = never fade)",
    "min": 0,
    "max": 120
  },
  {
    "name": "sm_ttt_icons_enabled",
    "path": "iconsEnabled",
    "type": "bool",
    "default": true,
    "help": "Role icons above heads (transmit-filtered). Off = bisect"
  }
];
