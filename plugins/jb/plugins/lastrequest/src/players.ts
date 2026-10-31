/**
 * Player helpers. A {@link Participant} remembers who someone is (userId + slot) and re-resolves
 * the live player every time it is used, so nothing stale is held across timers.
 */
import { Clients } from "@s2script/sdk";
import type { EntityRef } from "@s2script/sdk";
import { Player } from "@s2script/cs2";
import type { Pawn, Weapon } from "@s2script/cs2";
import { isAlive } from "@edgegamers/jailbreak-shared";
import type { PlayerRef } from "../api";

const MOVETYPE_NONE = 0;
const MOVETYPE_WALK = 2;

export class Participant {
  constructor(
    readonly slot: number,
    readonly userId: number,
    readonly steamId: string,
    readonly name: string,
  ) {}

  static of(p: Player): Participant {
    return new Participant(p.slot, p.userId, p.steamId, p.playerName ?? "");
  }

  /** The live player, or null if they left (a new player in the same slot is not them). */
  get player(): Player | null {
    const p = Player.fromUserId(this.userId);
    return p && p.slot === this.slot ? p : null;
  }

  get pawn(): Pawn | null {
    const pawn = this.player?.pawn ?? null;
    return pawn && pawn.isValid ? pawn : null;
  }

  get present(): boolean {
    return this.player !== null;
  }

  get alive(): boolean {
    return isAlive(this.player);
  }

  get health(): number {
    return this.pawn?.health ?? 0;
  }

  ref(): PlayerRef {
    return { slot: this.slot, userId: this.userId, steamId: this.steamId, name: this.name };
  }

  chat(message: string): void {
    if (this.present) Clients.fromSlot(this.slot)?.chat(message);
  }

  setHealth(hp: number): void {
    const pawn = this.pawn;
    if (!pawn) return;
    pawn.health = hp;
    if ((pawn.maxHealth ?? 100) < hp) pawn.maxHealth = hp;
  }

  setArmor(armor: number): void {
    const pawn = this.pawn;
    if (pawn) pawn.armorValue = armor;
  }

  strip(): void {
    this.pawn?.stripWeapons();
  }

  give(item: string): Weapon | null {
    return this.pawn?.giveNamedItem(item) ?? null;
  }

  slay(): void {
    this.pawn?.slay();
  }

  freeze(): void {
    const pawn = this.pawn;
    if (pawn) pawn.moveType = MOVETYPE_NONE;
  }

  unfreeze(): void {
    const pawn = this.pawn;
    if (pawn) pawn.moveType = MOVETYPE_WALK;
  }

  origin(): { x: number; y: number; z: number } | null {
    const o = this.pawn?.origin;
    return o ? { x: o.x, y: o.y, z: o.z } : null;
  }

  teleport(to: { x: number; y: number; z: number }): void {
    this.pawn?.ref.teleport([to.x, to.y, to.z]);
  }

  /** The weapon in this pawn's hands or inventory with item definition `def`, if any. */
  weaponByDef(def: number): Weapon | null {
    for (const w of this.pawn?.weapons ?? []) {
      if (w.attributeManager.item.itemDefinitionIndex === def) return w;
    }
    return null;
  }
}

/** True for a connected human or bot on a team (C# `IsReal`). */
export function isReal(p: Player | null | undefined): p is Player {
  return !!p && p.ref.isValid() && p.teamNum !== null;
}

/** Which player owns `ref` (their pawn or their controller), or null. */
export function playerOfEntity(ref: EntityRef | null): Player | null {
  if (!ref) return null;
  for (const p of Player.all()) {
    if (p.ref.index === ref.index) return p;
    const pawn = p.pawn;
    if (pawn && pawn.ref.index === ref.index) return p;
  }
  return null;
}

/** Every player on a team (alive or dead). */
export const countOnTeam = (teamNum: number): number =>
  Player.all().filter((p) => p.teamNum === teamNum).length;

/** Play a client-side sound to every connected human (C# `ExecuteClientCommand("play …")`). */
export function playToAll(sound: string): void {
  for (const c of Clients.all()) if (!c.isBot) c.command(`play ${sound}`);
}

