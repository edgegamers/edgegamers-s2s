import type {AliasSpec} from '../../../packages/contracts/config.ts';
/** Original Core metadata, now owned by Bodies. */
export const SPECS: readonly AliasSpec[] = [
  {
    "name": "sm_ttt_bodies_enabled",
    "path": "bodies.enabled",
    "type": "bool",
    "default": true,
    "help": "Corpses on death. Off = bisect"
  },
  {
    "name": "sm_ttt_body_hidepawn",
    "path": "bodies.hidePawn",
    "type": "bool",
    "default": true,
    "help": "Hide the victim's pawn once the corpse exists. Off = bisect"
  },
  {
    "name": "sm_ttt_body_settle",
    "path": "bodies.settle",
    "type": "bool",
    "default": true,
    "help": "Settle pass (ClearParent + MoveType + teleport) on the corpse. Off = bisect"
  },
  {
    "name": "sm_ttt_carry_body_offset",
    "path": "bodies.carryOffset",
    "type": "float",
    "default": 36,
    "help": "Carried corpse centring offset (units)",
    "min": -128,
    "max": 128
  },
  {
    "name": "sm_ttt_prop_pickup",
    "path": "bodies.propPickup",
    "type": "bool",
    "default": true,
    "help": "Allow players to carry props and bodies with USE"
  }
];
