import { Admin, ADMFLAG, Clients, Commands, Menu, MenuStyle, topmenu } from "@s2script/sdk";
import type { Client, EntityRef } from "@s2script/sdk";
import { Player } from "@s2script/cs2";
import { connectedPlayer, livePawn, sameRef } from "./actions";
import { plainPhraseFor } from "./phrases";

type Choice = { value: string; label: string; literal?: boolean };
type Action = {
  id: string; label: string; command: string; flags: number;
  target?: "alive" | "dead" | "any";
  values?: Choice[]; destination?: boolean; confirm?: boolean; fun?: boolean;
};
type Selection = { caller: Client; generation: number; target?: Player; pawn?: EntityRef; selfPawn?: EntityRef };
const pending = new Map<number, { menu: Menu; userId: number }>();
let generation = 0;
let ended = false;
const numbers = (...values: number[]): Choice[] => values.map(value => ({ value: String(value), label: String(value), literal: true }));
const choices = (...pairs: [string, string][]): Choice[] => pairs.map(([value, label]) => ({ value, label }));

function valid(selection: Selection): boolean {
  if (ended || selection.generation !== generation || !selection.caller.isValid()) return false;
  if (selection.target && !selection.target.ref.isValid()) return false;
  if (selection.pawn) {
    const pawn = selection.target && livePawn(selection.target);
    if (!pawn || !sameRef(selection.pawn, pawn.ref)) return false;
  }
  if (selection.selfPawn) {
    const pawn = connectedPlayer(selection.caller.slot)?.pawn;
    if (!pawn?.isValid || !sameRef(selection.selfPawn, pawn.ref)) return false;
  }
  return true;
}

function show(selection: Selection, title: string, items: Choice[], onPick: (value: string) => void): void {
  if (!valid(selection)) return;
  const slot = selection.caller.slot;
  const previous = pending.get(slot);
  pending.delete(slot);
  previous?.menu.close(slot);
  const menu = new Menu(plainPhraseFor(slot, title));
  menu.style = MenuStyle.Center;
  for (const item of items) menu.addItem(item.value, item.literal
    ? item.label.replace(/[\x00-\x1f\x7f]/g, "") : plainPhraseFor(slot, item.label));
  menu.onSelect(event => {
    if (event.slot !== slot || pending.get(slot)?.menu !== menu || !valid(selection)) return;
    if (!items.some(item => item.value === event.info)) return;
    pending.delete(slot);
    menu.close(slot);
    onPick(event.info);
  });
  menu.onCancel(() => { if (pending.get(slot)?.menu === menu) pending.delete(slot); });
  pending.set(slot, { menu, userId: selection.caller.userId });
  menu.display(slot, 30);
}

function pickPlayer(selection: Selection, title: string, target: "alive" | "dead" | "any", filterImmunity: boolean,
  onPick: (player: Player) => void): void {
  // Keep controller refs, not slots: an old selection must never target a later connection.
  const players = Player.allConnected().filter(player => player.ref.isValid()
    && (target === "any" || (target === "alive" ? !!livePawn(player) : player.pawnIsAlive === false))
    && (!filterImmunity || Admin.canTarget(selection.caller.slot, player.slot)));
  const pawns = new Map(players.map(player => [player.userId, player.pawn?.ref]));
  show(selection, title, players.map(player => ({ value: String(player.userId), label: player.playerName ?? String(player.userId), literal: true })), value => {
    const player = players.find(candidate => String(candidate.userId) === value);
    if (!player?.ref.isValid()) return;
    if (target === "alive") {
      const pawn = livePawn(player), original = pawns.get(player.userId);
      if (!pawn || !original || !sameRef(pawn.ref, original)) return;
    }
    if (target === "dead" && player.pawnIsAlive !== false) return;
    onPick(player);
  });
}

function execute(selection: Selection, action: Action, ...values: string[]): void {
  if (!valid(selection)) return;
  const args = selection.target ? [`#${selection.target.userId}`, ...values] : values;
  // Native dispatch rechecks command overrides/flags; handlers recheck target immunity and state.
  Commands.dispatch(action.command, selection.caller.slot, args.join(" "), "chat");
}

function finish(selection: Selection, action: Action): void {
  if (action.destination) {
    show(selection, "Teleport Destination", choices(["saved", "Saved Location"], ["player", "Another Player"]), mode => {
      if (mode === "saved") execute(selection, action);
      else pickPlayer(selection, "Choose Destination", "alive", false, player => execute(selection, action, `#${player.userId}`));
    });
  } else if (action.values) show(selection, action.label, action.values, value => execute(selection, action, value));
  else if (action.confirm) show(selection, "Confirm Self Kill", choices(["confirm", "Confirm"], ["cancel", "Cancel"]), value => {
    if (value === "confirm") execute(selection, action);
  });
  else execute(selection, action);
}

export function registerMenu(): void {
  const slay = ADMFLAG.SLAY, cheats = ADMFLAG.CHEATS, kick = ADMFLAG.KICK;
  const items = choices(["ak47", "AK-47"], ["m4a1_silencer", "M4A1-S"], ["awp", "AWP"], ["usp_silencer", "USP-S"],
    ["deagle", "Desert Eagle"], ["hegrenade", "HE Grenade"], ["smokegrenade", "Smoke Grenade"], ["kevlar", "Kevlar"]);
  const actions: Action[] = [
    { id: "health", label: "Health Item", command: "sm_health", flags: slay, target: "alive", values: numbers(1, 50, 100, 200, 1000) },
    { id: "armor", label: "Armor Item", command: "sm_armor", flags: slay, target: "alive", values: numbers(0, 50, 100, 200, 250) },
    { id: "give", label: "Give Item", command: "sm_give", flags: cheats, target: "alive", values: items },
    { id: "equip", label: "Equip Item", command: "sm_equip", flags: cheats, target: "alive", values: items },
    { id: "disarm", label: "Disarm Item", command: "sm_disarm", flags: slay, target: "alive" },
    { id: "respawn", label: "Respawn Item", command: "sm_respawn", flags: slay, target: "dead" },
    { id: "oneup", label: "Oneup Item", command: "sm_1up", flags: slay, target: "dead" },
    { id: "team", label: "Team Item", command: "sm_team", flags: kick, target: "any",
      values: choices(["t", "Terrorists"], ["ct", "Counter-Terrorists"], ["spec", "Spectators"]) },
    { id: "spec", label: "Spec Item", command: "sm_spec", flags: kick, target: "any" },
    { id: "swap", label: "Swap Item", command: "sm_swap", flags: kick, target: "any" },
    { id: "saveloc", label: "Save Location Item", command: "sm_saveloc", flags: cheats },
    { id: "teleport", label: "Teleport Item", command: "sm_tp", flags: slay, target: "alive", destination: true },
    { id: "god", label: "God Item", command: "sm_god", flags: cheats, target: "alive", fun: true,
      values: choices(["0", "Toggle"], ["1", "Enable"], ["-1", "Disable"]) },
    { id: "speed", label: "Speed Item", command: "sm_speed", flags: slay, target: "alive", fun: true, values: numbers(0.5, 1, 1.5, 2, 3) },
    { id: "size", label: "Size Item", command: "sm_size", flags: slay, target: "alive", fun: true, values: numbers(0.5, 1, 1.5, 2, 4) },
    { id: "unblind", label: "Unblind Item", command: "sm_unblind", flags: slay, target: "alive", fun: true },
    { id: "drug", label: "Drug Item", command: "sm_drug", flags: slay, target: "alive", fun: true, values: numbers(0, 5, 10, 30, 60) },
    { id: "undrug", label: "Undrug Item", command: "sm_undrug", flags: slay, target: "alive", fun: true },
    { id: "beacon", label: "Beacon Item", command: "sm_beacon", flags: slay, target: "alive", fun: true },
    { id: "kill", label: "Kill Item", command: "sm_kill", flags: 0, confirm: true },
  ];
  topmenu.addCategory("Player Commands");
  topmenu.addTab({ id: "funcommands", title: plainPhraseFor(-1, "Fun Commands") });
  for (const action of actions) topmenu.addItem(action.fun ? "funcommands" : "Player Commands", {
    id: `extracommands:${action.id}`, name: plainPhraseFor(-1, action.label), flags: action.flags,
    sheets: action.id === "kill" ? ["menu"] : ["admin"],
    onSelect: slot => {
      const caller = Clients.fromSlot(slot);
      if (!caller?.isValid() || ended) return;
      const previous = pending.get(slot);
      pending.delete(slot);
      previous?.menu.close(slot);
      const actor = connectedPlayer(slot);
      const selfPawn = action.confirm && actor ? livePawn(actor)?.ref : undefined;
      if (action.confirm && !selfPawn) return;
      const selection: Selection = { caller, generation, selfPawn };
      if (action.target) pickPlayer(selection, action.label, action.target, true, target => finish({ ...selection, target,
        pawn: action.target === "alive" ? livePawn(target)?.ref : undefined }, action));
      else finish(selection, action);
    },
  });
}

export function clearMenus(end = false): void {
  generation++;
  if (end) ended = true;
  const menus = [...pending];
  pending.clear();
  for (const [slot, entry] of menus) entry.menu.close(slot);
}

export function disconnectMenus(client: Client): void {
  const entry = pending.get(client.slot);
  if (!entry || entry.userId !== client.userId) return;
  pending.delete(client.slot);
  entry.menu.close(client.slot);
}
