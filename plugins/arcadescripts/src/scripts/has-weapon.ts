// ArcadeScripts for s2script. Derived from ArcadeScripts-CSS by Supergosciuツ (GPL-3.0).
// See LICENSE and NOTICE. Port of Scripts/HasWeapon/HasWeapon.cs (has_weapon_noname.nut).
import type { EntityRef } from '@s2script/sdk';
import { Script } from '../script';
import type { Runtime } from '../runtime';
import { fire, keyOf, pawnOf, valid } from '../util';

const GUNS = new Set([
  'weapon_ak47', 'weapon_aug', 'weapon_awp', 'weapon_bizon', 'weapon_cz75a', 'weapon_deagle', 'weapon_elite',
  'weapon_famas', 'weapon_fiveseven', 'weapon_g3sg1', 'weapon_galilar', 'weapon_glock', 'weapon_hkp2000',
  'weapon_m249', 'weapon_m4a1', 'weapon_m4a1_silencer', 'weapon_mac10', 'weapon_mag7', 'weapon_mp7', 'weapon_mp9',
  'weapon_negev', 'weapon_nova', 'weapon_p250', 'weapon_p90', 'weapon_sawedoff', 'weapon_scar20', 'weapon_sg556',
  'weapon_ssg08', 'weapon_tec9', 'weapon_ump45', 'weapon_usp_silencer', 'weapon_xm1014', 'weapon_revolver',
]);

const setVisible = (ref: EntityRef): void => fire(ref, 'Alpha', { value: '254', delay: 0.25 });
const setInvisible = (ref: EntityRef): void => fire(ref, 'Alpha', { value: '100', delay: 0.25 });

export class HasWeapon extends Script {
  private enabled = false;
  private inArea = new Map<string, EntityRef>();
  private withGuns = new Map<string, EntityRef>();
  private withoutGuns = new Map<string, EntityRef>();

  constructor(owner: EntityRef, rt: Runtime) {
    super(owner, rt);
    this.fn('CheckForPlayersWithWeapons', [], this.checkForPlayersWithWeapons);
    this.fn('EnterArea', ['entity'], this.enterArea);
    this.fn('SetEnabled', ['bool'], this.setEnabled);
    this.fn('ExitArea', ['entity'], this.exitArea);
  }

  override onPlayerSpawn(pawn: EntityRef): void {
    this.exitArea(pawn);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) return;
    for (const ref of this.withoutGuns.values()) setVisible(ref);
    this.inArea.clear();
    this.withGuns.clear();
    this.withoutGuns.clear();
  }

  private isPlayer(ref: EntityRef | null): ref is EntityRef {
    return valid(ref) && (this.rt.classOf(ref) === 'player' || pawnOf(ref) !== null);
  }

  enterArea(activator: EntityRef | null): void {
    if (this.isPlayer(activator)) this.inArea.set(keyOf(activator), activator);
  }

  exitArea(activator: EntityRef | null): void {
    if (!this.isPlayer(activator)) return;
    const key = keyOf(activator);
    if (!this.inArea.has(key)) return;
    setVisible(activator);
    this.inArea.delete(key);
    this.withGuns.delete(key);
    this.withoutGuns.delete(key);
  }

  checkForPlayersWithWeapons(): void {
    if (!this.enabled) return;
    const withGuns = new Map<string, EntityRef>();
    const withoutGuns = new Map(this.inArea);
    for (const [key, ref] of this.inArea) {
      const pawn = pawnOf(ref);
      if (!pawn) continue;
      if (pawn.weapons.some((weapon) => valid(weapon.ref) && GUNS.has(this.rt.classOf(weapon.ref)))) {
        withoutGuns.delete(key);
        withGuns.set(key, ref);
      }
    }
    // Newly armed players become visible, newly unarmed ones translucent.
    for (const [key, ref] of withGuns) if (!this.withGuns.has(key)) setVisible(ref);
    this.withGuns = withGuns;
    for (const [key, ref] of withoutGuns) if (!this.withoutGuns.has(key)) setInvisible(ref);
    this.withoutGuns = withoutGuns;
  }
}
