/**
 * Rock Paper Scissors (C# `RockPaperScissors`): after 3s both pick from a chat menu. A tie
 * replays; otherwise the loser is slain. If time runs out (25s, or the round clock), whoever
 * picked wins — nobody picked is a timeout.
 */
import { Chat, Menu, MenuStyle } from "@s2script/sdk";
import type { Timer } from "@s2script/sdk";
import type { LRResult, LRType } from "../../api";
import { RPS, rpsTimeoutResult, rpsWinner } from "../logic";
import { msg } from "../messages";
import { closeMenu, showMenu } from "../menus";
import { timeRemaining } from "../round";
import { LastRequest } from "./base";

export class RockPaperScissors extends LastRequest {
  readonly type: LRType = "rock_paper_scissors";
  private prisonerChoice = -1;
  private guardChoice = -1;
  private timeout: Timer | null = null;

  setup(): void {
    this.prisonerChoice = -1;
    this.guardChoice = -1;
    this.after(3000, () => this.execute());
  }

  private menu(): Menu {
    const m = new Menu(msg.rpsTitle(this.prisoner.name, this.guard.name));
    m.style = MenuStyle.Chat;
    RPS.forEach((name, i) => m.addItem(String(i), name));
    m.onSelect((e) => this.onSelect(e.slot, Number(e.info)));
    return m;
  }

  execute(): void {
    this.state = "active";
    showMenu(this.prisoner.slot, this.menu());
    showMenu(this.guard.slot, this.menu());
    const seconds = Math.max(1, Math.min(timeRemaining() - 1, 25));
    this.timeout?.kill();
    this.timeout = this.after(seconds * 1000, () => {
      if (this.state !== "active") return;
      this.finish(rpsTimeoutResult(this.prisonerChoice, this.guardChoice));
    });
  }

  private onSelect(slot: number, choice: number): void {
    if (!this.isParticipant(slot)) return;
    closeMenu(slot);
    if (slot === this.prisoner.slot) this.prisonerChoice = choice;
    else this.guardChoice = choice;

    if (this.prisonerChoice === -1 || this.guardChoice === -1) {
      const who = slot === this.prisoner.slot ? this.prisoner.name : this.guard.name;
      this.tell(msg.rpsMadeChoice(who));
      return;
    }

    this.tell(msg.rpsBoth());
    const winner = rpsWinner(this.prisonerChoice, this.guardChoice);
    if (winner === "tie") {
      Chat.toAll(msg.rpsTie());
      this.timeout?.kill();
      this.setup();
      return;
    }
    if (this.state !== "active") return;
    this.finish(winner === "prisoner" ? "prisoner_win" : "guard_win");
  }

  onEnd(result: LRResult): void {
    this.slayLoser(result);
    Chat.toAll(msg.rpsResults(this.guard.name, this.guardChoice, this.prisoner.name, this.prisonerChoice));
  }

  preventEquip(): boolean {
    return false;
  }
}
