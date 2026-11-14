/**
 * @edgegamers/s2s-weaponpaints — selection and apply veto points, and pluggable storage
 * (s2script interop protocol 2).
 *
 * WeaponPaints never knows who gates it. A listener answers the two hooks below; Handled or Stop
 * vetoes. With no listener every selection and every saved item behaves exactly as upstream.
 *
 * Saved rows are never touched by a veto: a vetoed apply only puts the default item on the player
 * this time, so the item comes back as soon as the listener allows it again.
 *
 * Storage: with config `storage = "database"` (the default) the plugin reads and writes its MySQL
 * tables, as upstream. With `storage = "plugin"` it never opens a database: it asks for a player
 * with `OnLoadRequested`, another plugin answers with `supply()`, and every change is sent out as
 * `OnStoreWrite` for that plugin to save. The rows and writes are the database's, so a provider
 * can pass them through to wherever the tables live (the EdgeGamers portal bridge does).
 */
import type { Hook, Notification } from "@s2script/sdk/interfaces";

/** What kind of item is being chosen or applied. */
export type ItemKind = "skin" | "knife" | "gloves" | "agent" | "music" | "pin" | "stattrak" | "sticker" | "keychain";

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
   * sticker: the sticker kit id (asked at apply time only, once per applied sticker).
   * keychain: the charm (keychain) definition id (asked at apply time only).
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

/** One wp_player_skins row without the steamid. Stickers and keychain use upstream's `;` format. */
export interface SkinRow {
  weapon_team: number;
  weapon_defindex: number;
  weapon_paint_id: number;
  weapon_wear: number;
  weapon_seed: number;
  weapon_nametag: string | null;
  weapon_stattrak: number;
  weapon_stattrak_count: number;
  weapon_sticker_0: string;
  weapon_sticker_1: string;
  weapon_sticker_2: string;
  weapon_sticker_3: string;
  weapon_sticker_4: string;
  weapon_keychain: string;
}

/**
 * Everything saved for one player, as rows of the WeaponPaints tables. `weapon_team` is 2 (T),
 * 3 (CT) or anything else for both teams, as in the database.
 */
export interface PlayerData {
  skins: SkinRow[];
  knife: { weapon_team: number; knife: string }[];
  gloves: { weapon_team: number; weapon_defindex: number }[];
  agents: { agent_ct: string | null; agent_t: string | null } | null;
  music: { weapon_team: number; music_id: number }[];
  pins: { weapon_team: number; id: number }[];
}

/**
 * One change to save. Each is the upsert the plugin runs against its own tables (keyed by steamid
 * and team, plus defindex for skins); `stattrak` only updates a skin row that already exists.
 */
export type StoreWrite =
  | { kind: "knife"; team: number; knife: string }
  | { kind: "gloves"; team: number; defindex: number }
  | { kind: "agent"; ct: string | null; t: string | null }
  | { kind: "music"; team: number; id: number }
  | { kind: "pin"; team: number; id: number }
  | { kind: "skin"; team: number; defindex: number; paint: number; wear: number; seed: number }
  | { kind: "stattrak"; team: number; defindex: number; enabled: boolean; count: number };

export interface LoadRequest {
  player: PlayerRef;
}

export interface StoreWriteEvent {
  /** Decimal SteamID64. */
  steamId: string;
  /** In order; apply them in order. */
  writes: StoreWrite[];
}

export interface WeaponPaints {
  /**
   * Put the player's loaded selections back on them without reloading the database (gloves,
   * weapons, agent, music kit, pin), so a change in what the apply hook allows shows at once.
   * Returns false when the player has nothing loaded or is not in game.
   */
  refresh(slot: number): boolean;
  /**
   * Read the player's selections from storage again, then put them on the player, as `!wp` does.
   * For a change saved somewhere else (the CS portal). With `storage = "plugin"` this emits
   * `OnLoadRequested`. Returns false when the slot holds no human player or the database is not
   * connected; true means the reload started.
   */
  reload(slot: number): boolean;
  /**
   * Answer an `OnLoadRequested` (storage "plugin"). Pass the request's `userId` so a late answer
   * cannot land on the next player in that slot. `null` means the load failed: the player keeps
   * what they had and can `!wp` to retry. Returns false when nothing is waiting for that player.
   * Without an answer a request gives up after 20 seconds.
   */
  supply(slot: number, userId: number, data: PlayerData | null): boolean;
}

export declare function refresh(slot: number): boolean;
export declare function reload(slot: number): boolean;
export declare function supply(slot: number, userId: number, data: PlayerData | null): boolean;

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
    /** Storage "plugin" only: load this player and answer with `supply()`. Join, `!wp`, `reload`. */
    OnLoadRequested: Notification<LoadRequest>;
    /**
     * Storage "plugin" only: save these changes (menu choices; StatTrak counters on disconnect and
     * unload). Fire and forget: WeaponPaints already uses them in game.
     */
    OnStoreWrite: Notification<StoreWriteEvent>;
  };
}
