import { ADMFLAG, HookResult } from "@s2script/sdk";
import type { Command, PhraseKey } from "@s2script/sdk";
import { Player, Pawn, Fade } from "@s2script/cs2";
import { FunEffects } from "./effects";
import { activityFor } from "./actions";

import { command } from "./commands";

// Number() alone accepts whitespace and hexadecimal. Accept complete finite decimal tokens only.
function numberArg(cmd: Command, index: number, min: number, max: number, fallback?: number): number | null {
  const token = cmd.arg(index);
  if (cmd.args.length <= index) return fallback ?? null;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(token)) return null;
  const value = Number(token);
  return Number.isFinite(value) && value >= min && value <= max ? value : null;
}

// Resolve immunity-filtered targets and count successful pawn operations.
function forEachPawn(
  cmd: Command,
  usageKey: PhraseKey,
  singularKey: PhraseKey,
  pluralKey: PhraseKey,
  fn: (p: Player, pw: Pawn) => void | boolean,
  filterImmunity: boolean,
  defaultSelf = true,
  details: (string | number)[] = [],
): void {
  let pattern = cmd.arg(0);
  if (!pattern) {
    if (!defaultSelf || cmd.callerSlot < 0) { cmd.replyT(usageKey); return; } // console must name a target
    pattern = "@me"; // in-game with no arg → self
  }
  const targets = Player.target(pattern, cmd.callerSlot, filterImmunity);
  if (targets.length === 0) { cmd.replyT("extracommands.target.no_matching_players"); return; }
  const report = activityFor(cmd);
  let n = 0;
  for (const p of targets) {
    const pw = p.pawn;
    if (pw && pw.isValid && fn(p, pw) !== false) n++;
  }
  report(n === 1 ? singularKey : pluralKey, n, ...details);
}

export function registerFunCommands(effects: FunEffects): void {

  command.admin("sm_god", ADMFLAG.CHEATS, cmd => {
    const mode = numberArg(cmd, 1, -1, 1, 0);
    if (mode === null || !Number.isInteger(mode)) { cmd.replyT("extracommands.god.invalid_mode"); return HookResult.Handled; }
    forEachPawn(cmd, "extracommands.god.usage", "extracommands.god.set_for_player", "extracommands.god.set_for_players", (_p, pw) => {
      if (pw.takesDamage === null) return false;
      const takesDamage = mode === 0 ? !pw.takesDamage : mode === -1;
      pw.takesDamage = takesDamage;
      return pw.takesDamage === takesDamage;
    }, true, false);
    return HookResult.Handled;
  });

  command.admin("sm_speed", ADMFLAG.SLAY, cmd => {
    if (!cmd.arg(0)) { cmd.replyT("extracommands.speed.usage"); return HookResult.Handled; }
    const factor = numberArg(cmd, 1, .01, 10);
    if (factor === null) { cmd.replyT("extracommands.speed.invalid_multiplier"); return HookResult.Handled; }
    forEachPawn(cmd, "extracommands.speed.usage", "extracommands.speed.set_for_player", "extracommands.speed.set_for_players", (p, pw) => effects.setSpeed(p, pw, factor), true, false, [factor]);
    return HookResult.Handled;
  });

  for (const name of ["sm_size", "sm_scale"]) command.admin(name, ADMFLAG.SLAY, cmd => {
    const scale = numberArg(cmd, 1, .2, 4, 1);
    if (scale === null) { cmd.replyT("extracommands.size.invalid_scale"); return HookResult.Handled; }
    forEachPawn(cmd, "extracommands.size.usage", "extracommands.size.set_for_player", "extracommands.size.set_for_players", (_p, pw) => pw.setModelScale(scale), true, false, [scale]);
    return HookResult.Handled;
  });

  command.admin("sm_unblind", ADMFLAG.SLAY, cmd => {
    forEachPawn(cmd, "extracommands.unblind.usage", "extracommands.unblind.unblind_for_player", "extracommands.unblind.unblind_for_players", p => Fade.to(p.slot, { duration: 0, holdTime: 0, color: 0, flags: 0x10 }), true, false);
    return HookResult.Handled;
  });

  command.admin("sm_drug", ADMFLAG.SLAY, cmd => {
    const seconds = numberArg(cmd, 1, 0, Number.MAX_SAFE_INTEGER / 1000, 0);
    if (seconds === null) { cmd.replyT("extracommands.drug.invalid_duration"); return HookResult.Handled; }
    forEachPawn(cmd, "extracommands.drug.usage", "extracommands.drug.drug_for_player", "extracommands.drug.drug_for_players", (p, pw) => effects.drug(p, pw, seconds), true, false, [seconds]);
    return HookResult.Handled;
  });

  command.admin("sm_undrug", ADMFLAG.SLAY, cmd => {
    forEachPawn(cmd, "extracommands.undrug.usage", "extracommands.undrug.undrug_for_player", "extracommands.undrug.undrug_for_players", (p, pw) => effects.undrug(p, pw), true, false);
    return HookResult.Handled;
  });

  command.admin("sm_beacon", ADMFLAG.SLAY, cmd => {
    forEachPawn(cmd, "extracommands.beacon.usage", "extracommands.beacon.toggle_for_player", "extracommands.beacon.toggle_for_players", (p, pw) => effects.beacon(p, pw), true, false);
    return HookResult.Handled;
  });

}
