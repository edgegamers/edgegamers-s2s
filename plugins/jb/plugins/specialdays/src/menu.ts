/** The `!sd` day picker (SpecialDayMenuSelector): every day in a random order, built once per load. */
import { Menu, MenuStyle } from "@s2script/sdk";
import type { SDType } from "../api";
import { ALL_TYPES, SD_NAMES, isSDType } from "./sdtype.ts";
import { shuffle } from "./geometry.ts";
import { msg } from "./messages.ts";

export function buildMenu(onPick: (slot: number, type: SDType) => void): Menu {
  const menu = new Menu(msg.menuTitle);
  menu.style = MenuStyle.Center;
  for (const type of shuffle([...ALL_TYPES])) menu.addItem(type, SD_NAMES[type]);
  menu.onSelect((e) => {
    if (isSDType(e.info)) onPick(e.slot, e.info);
  });
  return menu;
}
