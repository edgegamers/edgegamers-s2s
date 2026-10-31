import {forRecipients} from '@edgegamers/jailbreak-shared';
import {plainPhraseFor as labelFor} from '@edgegamers/jailbreak-shared';
/**
 * Shot for Shot / Mag for Mag (C# `BulletForBullet`). The prisoner picks a pistol; after 5s both
 * get it empty and a random player gets the first shot (one bullet, or a full magazine for mag
 * for mag). When the shooter's clip runs out the turn passes. Firing out of turn is cheating and
 * kills you. Knives at 30s; with `lr_b4b_kill_by_health` the lower-HP player dies at 60s.
 */
import { Menu, MenuStyle } from "@s2script/sdk";
import type { Weapon } from "@s2script/cs2";
import type { LRResult, LRType } from "../../api";
import { B4B_PISTOLS, b4bHealthDecision, GUN_DEFS, isKnifeDef, PISTOL_MAG } from "../logic";
import { guardName, msgFor, prisonerName } from "../messages";
import { settings } from "../settings";
import type { Participant } from "../players";
import { showMenu } from "../menus";
import type { LRHost } from "./base";
import { TeleportingRequest } from "./base";

function defOf(weapon: string): number {
  for (const [def, name] of Object.entries(GUN_DEFS)) if (name === weapon) return Number(def);
  return -1;
}

export class BulletForBullet extends TeleportingRequest {
  readonly type: LRType;
  private weapon = "weapon_deagle";
  private whosShot: number | null = null;
  private magSize = 1;
  private readonly guns = new Map<number, Weapon | null>();

  constructor(
    host: LRHost,
    id: number,
    prisoner: Participant,
    guard: Participant,
    private readonly magForMag: boolean,
  ) {
    super(host, id, prisoner, guard);
    this.type = magForMag ? "mag_for_mag" : "shot_for_shot";
  }

  configure(done: () => void, cancel: () => void): void {
    const menu = new Menu(msgFor(this.prisoner.slot).choosePistol);
    menu.style = MenuStyle.Center;
    for (const p of B4B_PISTOLS) menu.addItem(p.weapon,labelFor(this.prisoner.slot,p.name));
    menu.onSelect((e) => {
      this.weapon = e.info;
      done();
    });
    menu.onCancel(() => cancel());
    showMenu(this.prisoner.slot, menu);
  }

  setup(): void {
    this.prisoner.strip();
    this.guard.strip();
    super.setup();
    this.execute();
  }

  private gun(p: Participant): Weapon | null {
    const held = this.guns.get(p.slot);
    if (held && held.isValid()) return held;
    const found = p.weaponByDef(defOf(this.weapon));
    this.guns.set(p.slot, found);
    return found;
  }

  execute(): void {
    this.state = "pending";

    this.after(5000, () => {
      if (this.state !== "pending") return;
      const gGun = this.guard.give(this.weapon);
      const pGun = this.prisoner.give(this.weapon);
      this.guns.set(this.guard.slot, gGun);
      this.guns.set(this.prisoner.slot, pGun);

      const fullClip = pGun?.clip1 ?? null;
      this.magSize = this.magForMag ? (fullClip && fullClip > 0 ? fullClip : (PISTOL_MAG[this.weapon] ?? 1)) : 1;
      pGun?.setAmmo(0, 0);
      gGun?.setAmmo(0, 0);

      const shooter = Math.random() < 0.5 ? this.prisoner : this.guard;
      this.whosShot = shooter.slot;
      const name = shooter === this.prisoner ? prisonerName(shooter.name) : guardName(shooter.name);
      this.tell(forRecipients((recipient,value0) => msgFor(recipient).goesFirst(value0), name));
      this.gun(shooter)?.setAmmo(this.magSize, 0);
      this.state = "active";
    });

    this.after(30_000, () => {
      if (this.state !== "active") return;
      this.prisoner.give("weapon_knife");
      this.guard.give("weapon_knife");
    });

    if (!settings.b4bKillByHealth) return;
    this.after(60_000, () => {
      if (this.state !== "active") return;
      const d = b4bHealthDecision(this.guard.health, this.prisoner.health, this.whosShot === this.prisoner.slot);
      const winner = d.result === "guard_win" ? guardName(this.guard.name) : prisonerName(this.prisoner.name);
      this.tell(forRecipients((recipient,value0,value1,value2) => d.reason === "health" ? msgFor(recipient).winByHealth(value0) : msgFor(recipient).winByReason(value1, value2), winner,winner,d.reason));
      if (d.result === "guard_win") this.prisoner.slay();
      else this.guard.slay();
    });
  }

  onWeaponFire(slot: number): void {
    if (this.state !== "active" || this.whosShot === null) return;
    if (!this.isParticipant(slot)) return;
    const shooter = slot === this.prisoner.slot ? this.prisoner : this.guard;
    if (slot !== this.whosShot) {
      this.tell(forRecipients((recipient,value0) => msgFor(recipient).cheated(value0), shooter.name));
      shooter.slay();
      return;
    }
    const bullets = this.gun(shooter)?.clip1 ?? 1;
    if (bullets > 1) return;
    const opponent = this.opponentOf(slot);
    this.whosShot = opponent.slot;
    this.gun(opponent)?.setAmmo(this.magSize, 0);
  }

  onEnd(result: LRResult): void {
    if (result === "guard_win" && this.guard.present) this.guard.give("weapon_knife");
    else if (result === "prisoner_win" && this.prisoner.present) this.prisoner.give("weapon_knife");
  }

  preventEquip(slot: number, defIndex: number): boolean {
    if (this.state === "pending") return false;
    if (!this.isParticipant(slot)) return false;
    return !isKnifeDef(defIndex);
  }
}
