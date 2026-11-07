import { ADMFLAG, HookResult } from "@s2script/sdk";
import type { Command, PhraseKey } from "@s2script/sdk";
import { Player, Pawn, Fade } from "@s2script/cs2";
import { FunEffects } from "./effects";

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
): void {
  let pattern = cmd.arg(0);
  if (!pattern) {
    if (!defaultSelf || cmd.callerSlot < 0) { cmd.replyT(usageKey); return; } // console must name a target
    pattern = "@me"; // in-game with no arg → self
  }
  const targets = Player.target(pattern, cmd.callerSlot, filterImmunity);
  if (targets.length === 0) { cmd.replyT("No matching players"); return; }
  let n = 0;
  for (const p of targets) {
    const pw = p.pawn;
    if (pw && pw.isValid && fn(p, pw) !== false) n++;
  }
  cmd.replyT(n === 1 ? singularKey : pluralKey, n);
}

export function registerFunCommands(effects: FunEffects): void {

  command.admin("sm_god", ADMFLAG.CHEATS, cmd => {
    const mode = numberArg(cmd, 1, -1, 1, 0);
    if (mode === null || !Number.isInteger(mode)) { cmd.replyT("Invalid God Mode"); return HookResult.Handled; }
    forEachPawn(cmd, "Usage God", "Set God For Player", "Set God For Players", (_p, pw) => {
      if (pw.takesDamage === null) return false;
      const takesDamage = mode === 0 ? !pw.takesDamage : mode === -1;
      pw.takesDamage = takesDamage;
      return pw.takesDamage === takesDamage;
    }, true, false);
    return HookResult.Handled;
  });

  command.admin("sm_speed", ADMFLAG.SLAY, cmd => {
    if (!cmd.arg(0)) { cmd.replyT("Usage Speed"); return HookResult.Handled; }
    const factor = numberArg(cmd, 1, .01, 10);
    if (factor === null) { cmd.replyT("Invalid Speed"); return HookResult.Handled; }
    forEachPawn(cmd, "Usage Speed", "Set Speed For Player", "Set Speed For Players", (p, pw) => effects.setSpeed(p, pw, factor), true, false);
    return HookResult.Handled;
  });

  for (const name of ["sm_size", "sm_scale"]) command.admin(name, ADMFLAG.SLAY, cmd => {
    const scale = numberArg(cmd, 1, .2, 4, 1);
    if (scale === null) { cmd.replyT("Invalid Size"); return HookResult.Handled; }
    forEachPawn(cmd, "Usage Size", "Set Size For Player", "Set Size For Players", (_p, pw) => pw.setModelScale(scale), true, false);
    return HookResult.Handled;
  });

  command.admin("sm_unblind", ADMFLAG.SLAY, cmd => {
    forEachPawn(cmd, "Usage Unblind", "Unblinded Player", "Unblinded Players", p => Fade.to(p.slot, { duration: 0, holdTime: 0, color: 0, flags: 0x10 }), true, false);
    return HookResult.Handled;
  });

  command.admin("sm_drug", ADMFLAG.SLAY, cmd => {
    const seconds = numberArg(cmd, 1, 0, Number.MAX_SAFE_INTEGER / 1000, 0);
    if (seconds === null) { cmd.replyT("Invalid Drug Duration"); return HookResult.Handled; }
    forEachPawn(cmd, "Usage Drug", "Drugged Player", "Drugged Players", (p, pw) => effects.drug(p, pw, seconds), true, false);
    return HookResult.Handled;
  });

  command.admin("sm_undrug", ADMFLAG.SLAY, cmd => {
    forEachPawn(cmd, "Usage Undrug", "Undrugged Player", "Undrugged Players", (p, pw) => effects.undrug(p, pw), true, false);
    return HookResult.Handled;
  });

  command.admin("sm_beacon", ADMFLAG.SLAY, cmd => {
    forEachPawn(cmd, "Usage Beacon", "Toggled Beacon For Player", "Toggled Beacon For Players", (p, pw) => effects.beacon(p, pw), true, false);
    return HookResult.Handled;
  });

}
