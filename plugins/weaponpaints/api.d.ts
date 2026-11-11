/**
 * @edgegamers/s2s-weaponpaints — selection and apply veto points (s2script interop protocol 2).
 *
 * WeaponPaints never knows who gates it. A listener answers the two hooks below; Handled or Stop
 * vetoes. With no listener every selection and every saved item behaves exactly as upstream.
 *
 * Saved rows are never touched by a veto: a vetoed apply only puts the default item on the player
 * this time, so the item comes back as soon as the listener allows it again.
 */
import type { Hook } from "@s2script/sdk/interfaces";

/** What kind of item is being chosen or applied. */
export type ItemKind = "skin" | "knife" | "gloves" | "agent" | "music" | "pin" | "stattrak";

/** A player reference copied onto the wire. */
export interface PlayerRef {
  slot: number;
  userId: number;
  /** Decimal SteamID64. */
  steamId: string;
}

/** The item, described the same way at select and at apply time. Unused fields are 0 or "". */
export interface ItemRef {
  kind: ItemKind;
  /**
   * skin / stattrak: the weapon's item definition index. knife: the knife's definition index.
   * gloves: the glove definition index. music: the music kit id. pin: the pin (collectible) id.
   * agent: 0.
   */
  defindex: number;
  /** skin / gloves: the paint kit. 0 otherwise. */
  paint: number;
  /** knife: the weapon class (`weapon_knife_karambit`). agent: the model path. "" otherwise. */
  model: string;
}

export interface ItemRequest {
  player: PlayerRef;
  /** The team the choice is for: 2 = T, 3 = CT, 0 = both (chosen while unassigned or spectating). */
  team: number;
  item: ItemRef;
}

export interface WeaponPaints {
  /**
   * Put the player's loaded selections back on them without reloading the database (gloves,
   * weapons, agent, music kit, pin), so a change in what the apply hook allows shows at once.
   * Returns false when the player has nothing loaded or is not in game.
   */
  refresh(slot: number): boolean;
}

export declare function refresh(slot: number): boolean;

export interface Contract {
  methods: WeaponPaints;
  forwards: {
    /**
     * A player picked an item in a menu (or turned StatTrak on). Handled/Stop refuse it: nothing
     * is saved or applied, and WeaponPaints prints nothing, so the listener should say why.
     * Choosing a default (None, the default knife, default gloves) or turning StatTrak off is
     * never asked.
     */
    OnSelectionRequested: Hook<ItemRequest>;
    /**
     * A saved item is about to be put on the player. Handled/Stop apply the default instead;
     * the saved selection is kept. Asked on every apply, so answer from memory.
     */
    OnApplyRequested: Hook<ItemRequest>;
  };
}
