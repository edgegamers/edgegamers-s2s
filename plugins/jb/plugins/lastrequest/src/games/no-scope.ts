import {plainPhraseFor as labelFor} from '@edgegamers/jailbreak-shared';
/**
 * No Scope (C# `NoScope`): the prisoner picks a sniper rifle, countdown, then both get it with
 * the scope disabled every frame. Knives at 30s; at 60s the healthier player wins (guard needs
 * strictly more HP). The winner is re-armed with a knife + AK-47 (the loser is left alive).
 */
import { Server } from "@s2script/sdk";
import { Menu, MenuStyle } from "@s2script/sdk";
import type { LRResult, LRType } from "../../api";
import { isKnifeDef, NOSCOPE_RIFLES, noScopeTimeoutResult } from "../logic";
import { msgFor } from "../messages";
import { WeaponizedRequest } from "./base";
import { showMenu } from "../menus";

const TICKS_PER_SECOND = 64;

export class NoScope extends WeaponizedRequest {
  readonly type: LRType = "no_scope";
  private weapon = "weapon_ssg08";

  configure(done: () => void, cancel: () => void): void {
    const menu = new Menu(msgFor(this.prisoner.slot).chooseRifle);
    menu.style = MenuStyle.Center;
    for (const r of NOSCOPE_RIFLES) menu.addItem(r.weapon,labelFor(this.prisoner.slot,r.name));
    menu.onSelect((e) => {
      this.weapon = e.info;
      done();
    });
    menu.onCancel(() => cancel());
    showMenu(this.prisoner.slot, menu);
  }

  execute(): void {
    this.tell(recipient => msgFor(recipient).go());
    this.prisoner.give(this.weapon);
    this.guard.give(this.weapon);
    this.state = "active";

    this.after(30_000, () => {
      if (this.state !== "active") return;
      this.prisoner.give("weapon_knife");
      this.guard.give("weapon_knife");
    });
    this.after(60_000, () => {
      if (this.state !== "active") return;
      this.finish(noScopeTimeoutResult(this.guard.health, this.prisoner.health));
    });
  }

  onFrame(): void {
    if (this.state !== "active") return;
    const blockUntil = Math.floor(Server.gameTime * TICKS_PER_SECOND) + 500;
    for (const p of [this.prisoner, this.guard]) {
      const w = p.pawn?.activeWeapon;
      if (w && w.isValid()) w.nextSecondaryAttackTick = blockUntil;
    }
  }

  /** Unlike the other weaponized LRs the loser is NOT slain here (C# parity): the winner is re-armed. */
  onEnd(result: LRResult): void {
    if (result !== "guard_win" && result !== "prisoner_win") return;
    const winner = result === "guard_win" ? this.guard : this.prisoner;
    winner.strip();
    winner.give("weapon_knife");
    winner.give("weapon_ak47");
  }

  preventEquip(slot: number, defIndex: number): boolean {
    if (this.state === "pending") return false;
    if (!this.isParticipant(slot)) return false;
    return !isKnifeDef(defIndex);
  }
}
