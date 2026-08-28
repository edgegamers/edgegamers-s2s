import { Player } from "@s2script/cs2";

interface EnforcedName {
  slot: number;
  name: string;
}

export class NameManager {
  private readonly names = new Map<string, EnforcedName>();

  has(steamId: string): boolean {
    return this.names.has(steamId);
  }

  nameOf(steamId: string): string | null {
    return this.names.get(steamId)?.name ?? null;
  }

  apply(slot: number, steamId: string, name: string): void {
    this.names.set(steamId, { slot, name });
    this.write(slot, steamId, name);
  }

  reapplyAll(): void {
    for (const [steamId, record] of this.names) this.write(record.slot, steamId, record.name);
  }

  needsEnforcement(steamId: string, newName: string): boolean {
    const name = this.nameOf(steamId);
    return name !== null && newName !== name;
  }

  enforce(slot: number, steamId: string): boolean {
    const record = this.names.get(steamId);
    if (record === undefined) return false;
    record.slot = slot;
    return this.write(slot, steamId, record.name);
  }

  forget(steamId: string): void {
    this.names.delete(steamId);
  }

  private write(slot: number, steamId: string, name: string): boolean {
    const player = Player.fromSlot(slot);
    if (player?.steamId !== steamId) return false;
    return player.setName(name);
  }
}
