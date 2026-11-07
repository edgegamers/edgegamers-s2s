/**
 * Shot for Shot / Mag for Mag (C# `BulletForBullet`). The prisoner picks a pistol; after 5s both
 * get it empty and a random player gets the first shot (one bullet, or a full magazine for mag
 * for mag). Only the shooter ever holds ammo; once their magazine is empty the turn passes and the
 * other player is loaded. Firing a loaded gun out of turn is cheating and kills you. Knives at 30s; with `lr_b4b_kill_by_health` the lower-HP player dies at 60s.
 */
import { Menu, MenuStyle } from "@s2script/sdk";
import type { Weapon } from "@s2script/cs2";
import { reserveAmmo, setWeaponAmmo } from "@edgegamers/jailbreak-shared";
import type { LRResult, LRType } from "../../api";
import { B4B_PISTOLS, b4bHealthDecision, B4BTurns, GUN_DEFS, isKnifeDef, PISTOL_MAG } from "../logic";
import { guardName, msg, prisonerName } from "../messages";
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
  private turns: B4BTurns | null = null;
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
    const menu = new Menu(msg.choosePistol);
    menu.style = MenuStyle.Center;
    for (const p of B4B_PISTOLS) menu.addItem(p.weapon, p.name);
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

  /** Hand `p` their turn: a full turn's magazine and no reserve, so the shot count can't be topped up. */
  private load(p: Participant): void {
    const g = this.gun(p);
    if (g) setWeaponAmmo(g, this.magSize, 0);
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
      if (pGun) setWeaponAmmo(pGun, 0, 0);
      if (gGun) setWeaponAmmo(gGun, 0, 0);

      const shooter = Math.random() < 0.5 ? this.prisoner : this.guard;
      this.turns = new B4BTurns(shooter.slot);
      const name = shooter === this.prisoner ? prisonerName(shooter.name) : guardName(shooter.name);
      this.tell(msg.goesFirst(name));
      this.load(shooter);
      this.state = "active";
      this.every(100, () => this.enforce());
    });

    this.after(30_000, () => {
      if (this.state !== "active") return;
      this.prisoner.give("weapon_knife");
      this.guard.give("weapon_knife");
    });

    if (!settings.b4bKillByHealth) return;
    this.after(60_000, () => {
      if (this.state !== "active") return;
      const d = b4bHealthDecision(this.guard.health, this.prisoner.health, this.turns?.whosShot === this.prisoner.slot);
      const winner = d.result === "guard_win" ? guardName(this.guard.name) : prisonerName(this.prisoner.name);
      this.tell(d.reason === "health" ? msg.winByHealth(winner) : msg.winByReason(winner, d.reason));
      if (d.result === "guard_win") this.prisoner.slay();
      else this.guard.slay();
    });
  }

  /** The participant whose turn it is. */
  private shooter(): Participant | null {
    const slot = this.turns?.whosShot;
    return slot === this.prisoner.slot ? this.prisoner : slot === this.guard.slot ? this.guard : null;
  }

  /** Pass the turn once the shooter's magazine is empty. */
  private checkTurn(): void {
    const shooter = this.shooter();
    if (!this.turns || !shooter) return;
    const opponent = this.opponentOf(shooter.slot);
    if (this.turns.turnOver(this.gun(shooter)?.clip1 ?? null, opponent.slot)) this.load(opponent);
  }

  /** Every 100 ms: pass a finished turn, and keep the waiting player's gun empty and the shooter's reserve at 0. */
  private enforce(): void {
    if (this.state !== "active") return;
    this.checkTurn();
    const shooter = this.shooter();
    if (!shooter) return;
    const waiting = this.gun(this.opponentOf(shooter.slot));
    if (waiting && ((waiting.clip1 ?? 0) !== 0 || (reserveAmmo(waiting) ?? 0) !== 0)) setWeaponAmmo(waiting, 0, 0);
    const held = this.gun(shooter);
    if (held && (reserveAmmo(held) ?? 0) !== 0) setWeaponAmmo(held, held.clip1 ?? 0, 0);
  }

  onWeaponFire(slot: number): void {
    if (this.state !== "active" || !this.turns) return;
    if (!this.isParticipant(slot)) return;
    const player = slot === this.prisoner.slot ? this.prisoner : this.guard;
    const g = this.gun(player);
    const verdict = this.turns.onFire(slot, g?.clip1 ?? null, g ? reserveAmmo(g) : null);
    if (verdict === "cheat") {
      this.tell(msg.cheated(player.name));
      player.slay();
    } else if (verdict === "shot") {
      this.checkTurn();
    }
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
