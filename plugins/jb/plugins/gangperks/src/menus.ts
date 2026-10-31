import {plainPhraseFor as labelFor} from '@edgegamers/jailbreak-shared';
/**
 * The perk menu (C# `AbstractEnumMenu`): the equipped option first, then unlocked options, then
 * locked ones with their price. Picking an entry runs the perk command with that option, exactly
 * like the C# menu re-dispatching `css_<perk> <OPTION>`.
 */
import { Menu } from "@s2script/sdk/menu";
import type { EnumPerkDef } from "./perks.ts";
import { menuOrder } from "./enum-perk.ts";
import { msgFor } from "./messages.ts";

const MENU_SECONDS = 30;

export function openPerkMenu(
  def: EnumPerkDef,
  slot: number,
  unlocked: number,
  equipped: number,
  onPick: (slot: number, optionName: string) => void,
): void {
  const menu = new Menu(msgFor(slot).menuTitle(def));
  menu.addItem("", labelFor(slot,def.description), { disabled: true });
  for (const { opt, state } of menuOrder(def, unlocked, equipped)) {
    menu.addItem(opt.name, msgFor(slot).menuItem(opt, state, def));
  }
  menu.onSelect((e) => {
    if (e.info !== "") onPick(e.slot, e.info);
  });
  menu.display(slot, MENU_SECONDS);
}
