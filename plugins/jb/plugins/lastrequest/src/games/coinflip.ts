import {forRecipients} from '@edgegamers/jailbreak-shared';
import {plainPhraseFor as labelFor,phraseFor} from '@edgegamers/jailbreak-shared';
/**
 * Coinflip (C# `Coinflip`): the guard calls heads or tails (10s, else a random call), the coin
 * spins (with a 1-in-4 chance of some flavour text and another spin), and the loser is slain.
 */
import { Menu, MenuStyle } from "@s2script/sdk";
import type { Timer } from "@s2script/sdk";
import type { LRResult, LRType } from "../../api";
import { COINFLIP_EVENTS, coinflipResult } from "../logic";
import { msgFor } from "../messages";
import { closeMenu, showMenu } from "../menus";
import { LastRequest } from "./base";

const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

export class Coinflip extends LastRequest {
  readonly type: LRType = "coinflip";
  private timeout: Timer | null = null;

  setup(): void {
    this.state = "pending";
    this.execute();
  }

  execute(): void {
    this.state = "active";
    const menu = new Menu(msgFor(this.guard.slot).coinflipTitle(this.prisoner.name, this.guard.name));
    menu.style = MenuStyle.Chat;
    menu.addItem("heads", labelFor(this.guard.slot,"JB_LASTREQUEST_LABEL_HEADS"));
    menu.addItem("tails", labelFor(this.guard.slot,"JB_LASTREQUEST_LABEL_TAILS"));
    menu.onSelect((e) => {
      if (e.slot !== this.guard.slot || this.state !== "active") return;
      this.decide(e.info === "heads", true);
    });
    showMenu(this.guard.slot, menu);

    this.timeout = this.after(10_000, () => {
      if (this.state !== "active") return;
      closeMenu(this.guard.slot);
      const heads = Math.random() < 0.5;
      this.guard.chat(msgFor(this.guard.slot).failedToChoose(heads));
      this.decide(heads, true);
    });
  }

  private decide(heads: boolean, announce: boolean): void {
    this.timeout?.kill();
    this.timeout = null;
    if (announce) {
      closeMenu(this.guard.slot);
      this.tell(forRecipients((recipient,value0,value1) => msgFor(recipient).guardChose(value0, value1), this.guard.name,heads));
    }
    this.after(2000, () => {
      if (Math.random() < 0.25) {
        this.tell(forRecipients((recipient,value0) => msgFor(recipient).coinEvent(value0), pick(COINFLIP_EVENTS)));
        this.after(2000, () => this.decide(heads, false));
        return;
      }
      const landedHeads = Math.random() < 0.5;
      this.tell(forRecipients((recipient,value0) => msgFor(recipient).coinLands(value0), landedHeads));
      this.finish(coinflipResult(heads, landedHeads));
    });
  }

  onEnd(result: LRResult): void {
    if (result === "prisoner_win") this.guard.slay();
    else if (result === "guard_win") this.prisoner.slay();
  }

  preventEquip(): boolean {
    return false;
  }
}
