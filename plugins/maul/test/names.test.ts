import { describe, expect, it, mock } from "bun:test";
let players: any[] = [];
mock.module("@s2script/cs2", () => ({ Player: { allConnected: () => players, fromSlot: (slot: number) => players.find(p => p.slot === slot) ?? null } }));
const { NameManager } = await import("../src/names.ts");
const log = { debug() {}, warn() {}, info() {}, error() {} };
function player(userId = 1) {
  const writes: string[] = [];
  return { slot: 0, steamId: "id", userId, playerName: "Original", writes, setName(name: string) { writes.push(name); this.playerName = name; return true; } };
}
describe("managed names with optional Decluttr", () => {
  it("retains desired advertising names, re-sanitizes on reload and restores them on detach", () => {
    const p = player(); players = [p]; let enabled = false;
    const names = new NameManager(log, (_slot, desired) => enabled ? "Player" : desired);
    names.apply(0, "id", "visit example.test");
    enabled = true; names.reapplyAll();
    expect(names.nameOf("id")).toBe("Player");
    expect(names.needsEnforcement("id", "Player")).toBe(false);
    names.reapplyAll(); expect(p.writes).toEqual(["visit example.test", "Player"]);
    names.apply(0, "id", "new.example.test");
    enabled = false; names.reapplyAll();
    expect(p.playerName).toBe("new.example.test");
    expect(names.nameOf("id")).toBe("new.example.test");
  });
  it("publishes the effective name before native rename echo and enforces it without a loop", () => {
    const p = player(); players = [p];
    const names = new NameManager(log, () => "Player");
    p.setName = name => { expect(names.needsEnforcement("id", name)).toBe(false); p.writes.push(name); p.playerName = name; return true; };
    names.apply(0, "id", "example.test");
    expect(names.needsEnforcement("id", "Spoof")).toBe(true);
    p.playerName = "Spoof"; names.enforce(0, "id", 1);
    expect(p.writes).toEqual(["Player", "Player"]);
  });
  it("does not write to a recycled same-SteamID connection during sanitization or deferred correction", () => {
    const old = player(); const next = player(2); players = [old];
    const names = new NameManager(log, (_slot, desired) => { players = [next]; return desired; });
    names.apply(0, "id", "MAUL");
    expect(next.writes).toEqual([]); expect(old.writes).toEqual([]);
    names.enforce(0, "id", 1); expect(next.writes).toEqual([]);
  });
});
