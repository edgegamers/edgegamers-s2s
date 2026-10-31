import {plainPhraseFor as labelFor} from '@edgegamers/jailbreak-shared';
/**
 * LR menus (C# `LastRequestMenuSelector` / `LastRequestPlayerSelector`) plus a tiny registry of
 * the menus this plugin has open, so round start can close them all.
 */
import { Menu, MenuStyle } from "@s2script/sdk";
import { Player } from "@s2script/cs2";
import { isAlive, Team } from "@edgegamers/jailbreak-shared";
import { isWarden } from "@edgegamers/jailbreak-warden";
import type { LRType } from "../api";
import { lrName, LR_TYPES } from "./logic";

const open = new Map<number, Menu>();

export function showMenu(slot: number, menu: Menu, seconds = 0): void {
  open.set(slot, menu);
  menu.display(slot, seconds);
}

export function closeMenu(slot: number): void {
  const m = open.get(slot);
  if (!m) return;
  open.delete(slot);
  m.close(slot);
}

export function closeAllMenus(): void {
  for (const slot of [...open.keys()]) closeMenu(slot);
}

/** "Which LR?" — every available type. */
export function showTypeMenu(
  slot: number,
  title: string,
  available: (t: LRType) => boolean,
  onPick: (type: LRType) => void,
): void {
  const menu = new Menu(title);
  menu.style = MenuStyle.Center;
  for (const t of LR_TYPES) if (available(t)) menu.addItem(t,labelFor(slot,lrName(t)));
  menu.onSelect((e) => {
    open.delete(e.slot);
    onPick(e.info as LRType);
  });
  showMenu(slot, menu);
}

/**
 * "Against whom?" — living guards (every living player in debug mode); guards already in an LR
 * are listed but disabled. The warden is labelled.
 */
export function showPlayerMenu(
  slot: number,
  title: string,
  debug: boolean,
  inLR: (slot: number) => boolean,
  onPick: (target: Player) => void,
): void {
  const menu = new Menu(title);
  menu.style = MenuStyle.Center;
  for (const p of Player.all()) {
    if (!isAlive(p)) continue;
    if (!debug && p.teamNum !== Team.Guard) continue;
    const label = (p.playerName ?? "?") + (isWarden(p.slot) ? labelFor(slot,"LABEL_WARDEN_SUFFIX") : "");
    menu.addItem(String(p.userId), label, { disabled: !debug && inLR(p.slot) });
  }
  menu.onSelect((e) => {
    open.delete(e.slot);
    const target = Player.fromUserId(Number(e.info));
    if (target) onPick(target);
  });
  showMenu(slot, menu);
}

/** True if at least one living guard exists (C# `WouldHavePlayers`). */
export function wouldHavePlayers(): boolean {
  return Player.all().some((p) => p.teamNum === Team.Guard && isAlive(p));
}
