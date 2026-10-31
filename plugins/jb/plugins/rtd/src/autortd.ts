/**
 * Auto-RTD (C# AutoRTD): players with the `autortd_flag` admin flag(s) roll automatically at every
 * round end unless they turned it off with `!autortd`. The preference is a clientprefs cookie
 * (`jb_rtd_auto`, "Y"/"N", unset = on) — the C# persisted it the same way through MAUL cookies.
 */
import { Admin, Clients, Cookies, HookResult, config, nextFrame } from "@s2script/sdk";
import type { Command, Cookie, HookResultValue } from "@s2script/sdk";
import { Player } from "@s2script/cs2";
import { autoRtdEnabled, parseFlagLetters, toggledAutoRtd } from "./rules.ts";
import { hasReward, isWarmup, minPlayers, roll } from "./rtd.ts";
import { msgFor } from "./messages.ts";

let cookie: Cookie | null = null;

/** Load window: register the cookie. */
export function initAutoRtd(): void {
  cookie = Cookies.register("jb_rtd_auto", { description: "Automatically roll the dice at round end (Y/N)" });
}

function hasAutoFlag(slot: number): boolean {
  const mask = parseFlagLetters(config.getString("autortd_flag"));
  if (mask === 0) return true;
  return Admin.forSlot(slot)?.hasFlags(mask) ?? false;
}

/** Core OnRoundEnd: next frame, roll for everyone who has auto-RTD on and no pending reward. */
export function onRoundEnd(): void {
  if (isWarmup() || cookie === null) return;
  const c = cookie;
  void nextFrame().then(() => {
    for (const player of Player.all()) {
      if (hasReward(player.userId) || !hasAutoFlag(player.slot)) continue;
      const client = Clients.fromSlot(player.slot);
      if (!client || client.isBot || !Cookies.areCached(client)) continue;
      if (autoRtdEnabled(Cookies.get(client, c))) roll(player, null);
    }
  });
}

/** `!autortd`: toggle the preference. */
export function cmdAutoRtd(cmd: Command): HookResultValue {
  const slot = cmd.callerSlot;
  if (slot < 0) return HookResult.Handled;
  if (minPlayers() === -1) {
    cmd.replyToChat(msgFor(cmd.callerSlot).rollingDisabled);
    return HookResult.Handled;
  }
  if (!hasAutoFlag(slot)) {
    cmd.replyToChat(msgFor(cmd.callerSlot).noPermission);
    return HookResult.Handled;
  }
  const client = Clients.fromSlot(slot);
  if (cookie === null || !client || client.isBot || !Cookies.areCached(client)) {
    cmd.replyToChat(msgFor(cmd.callerSlot).autoNotSupported);
    return HookResult.Handled;
  }
  const next = toggledAutoRtd(Cookies.get(client, cookie));
  if (!Cookies.set(client, cookie, next.value)) {
    cmd.replyToChat(msgFor(cmd.callerSlot).autoNotSupported);
    return HookResult.Handled;
  }
  cmd.replyToChat(msgFor(cmd.callerSlot).autoToggled(next.enabled));
  return HookResult.Handled;
}
