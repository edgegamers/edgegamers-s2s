// ArcadeScripts for s2script. Derived from ArcadeScripts-CSS 1.0.2 by Supergosciuツ (GPL-3.0).
// See LICENSE and NOTICE. Port of ArcadeScripts.cs and Events.cs.
//
// jb_arcade_b6 drives its minigames through VScript logic_script entities, which CS2 no longer
// runs. This plugin replaces each script with a TypeScript port and answers the map's
// RunScriptCode inputs on its behalf.
import { createScope, hook, onInput, Server } from '@s2script/sdk';
import type { ScriptConstructor } from './script';
import { Runtime } from './runtime';
import { Bee } from './scripts/bee';
import { Blob } from './scripts/blob';
import { BlockJump } from './scripts/block-jump';
import { CarSecret } from './scripts/car-secret';
import { CellInstructions } from './scripts/cell-instructions';
import { CellRewards } from './scripts/cell-rewards';
import { Colors } from './scripts/colors';
import { Compass } from './scripts/compass';
import { Darude } from './scripts/darude';
import { Decathlon } from './scripts/decathlon';
import { Decoys } from './scripts/decoys';
import { FidgetSpinner } from './scripts/fidget-spinner';
import { Flight } from './scripts/flight';
import { Follower } from './scripts/follower';
import { Grab } from './scripts/grab';
import { HasWeapon } from './scripts/has-weapon';
import { Hurt } from './scripts/hurt';
import { ItemInArea } from './scripts/item-in-area';
import { LightDuel } from './scripts/light-duel';
import { Lightning } from './scripts/lightning';
import { Lunge } from './scripts/lunge';
import { PlaySoundAt } from './scripts/play-sound-at';
import { Poison } from './scripts/poison';
import { RocketJump } from './scripts/rocket-jump';
import { Rogue } from './scripts/rogue';
import { StrafeJump } from './scripts/strafe-jump';
import { Surf } from './scripts/surf';
import { SurfTimer } from './scripts/surf-timer';
import { Tapper } from './scripts/tapper';

/** The map's `vscripts` keyvalues and the port that replaces each one. */
export const SCRIPTS: Readonly<Record<string, ScriptConstructor>> = {
  'playsoundat.nut': PlaySoundAt,
  'colors.nut': Colors,
  'blockjump.nut': BlockJump,
  'darude.nut': Darude,
  'item_in_area.nut': ItemInArea,
  'car_secret.nut': CarSecret,
  'decathlon.nut': Decathlon,
  'surf.nut': Surf,
  'bee.nut': Bee,
  'tapper.nut': Tapper,
  'strafe_jump.nut': StrafeJump,
  'lightduel.nut': LightDuel,
  'blob.nut': Blob,
  'fidgetspinner.nut': FidgetSpinner,
  'rocketjump.nut': RocketJump,
  'follower.nut': Follower,
  'cell_instructions.nut': CellInstructions,
  cellrewards: CellRewards,
  'decoys.nut': Decoys,
  'has_weapon_noname.nut': HasWeapon,
  'hurt.nut': Hurt,
  'lightning.nut': Lightning,
  'lunge.nut': Lunge,
  'poison.nut': Poison,
  'rogue.nut': Rogue,
  'timer.nut': SurfTimer,
  'grab.nut': Grab,
  'compass.nut': Compass,
  'flight.nut': Flight,
};

const rt = new Runtime(SCRIPTS);

export function OnPluginStart(): void {
  rt.mapStart(Server.mapName);

  const scope = createScope();
  scope.server.onMapStart((map) => rt.mapStart(map));
  scope.server.onGameFrame(() => rt.frame());
  scope.entities.onCreate('*', (ref, className) => rt.entityCreated(ref, className));
  scope.entities.onSpawn('*', (ref, className) => rt.entitySpawned(ref, className));
  scope.entities.onDelete('*', (ref, className) => rt.entityDeleted(ref, className));

  hook.onPre('round_prestart', () => rt.roundPrestart());
  hook.on('round_start', () => rt.roundStarted());
  hook.on('player_spawn', (ev) => rt.playerSpawned(ev.getPlayerSlot('userid')));

  onInput('logic_script', 'RunScriptCode', (ev) => {
    if (rt.active) rt.runScriptCode(ev.entity, ev.value, ev.activator, ev.caller);
  });
}

export function OnPluginEnd(): void {
  rt.unload();
}
