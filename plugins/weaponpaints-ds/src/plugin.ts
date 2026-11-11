// @edgegamers/s2s-weaponpaints-ds — gates WeaponPaints items by MAUL Dedicated Supporter tier.
//
// WeaponPaints asks (OnSelectionRequested, OnApplyRequested); this plugin answers from the policy
// file and the tier MAUL cached on connect. Remove this plugin and WeaponPaints is ungated again.
// A refused apply only shows the default item: the player's saved rows are never touched, so a
// lapsed supporter gets everything back on resubscribing.

import { Chat, Clients, command, config, HookResult, use } from "@s2script/sdk";
import type { HookResultValue } from "@s2script/sdk";
import { ChatColors } from "@s2script/cs2";
import type { ItemRequest } from "@edgegamers/s2s-weaponpaints";
import { allows, DEFAULT_POLICY, parsePolicy, refusal, requiredTier, type Policy } from "./policy.ts";

const POLICY_FILE = "weaponpaints_ds_policy.json";
const log = (m: string): void => console.log(`[WeaponPaints-DS] ${m}`);

let policy: Policy = DEFAULT_POLICY;
let loaded = false;

/** Read the policy file, keeping the last good copy (or the default) when it is malformed. */
function loadPolicy(): string {
  const text = config.readFile(POLICY_FILE);
  if (text === null) {
    config.writeFile(POLICY_FILE, JSON.stringify(DEFAULT_POLICY, null, 2) + "\n");
    policy = DEFAULT_POLICY;
    loaded = true;
    return `wrote the default ${POLICY_FILE} (${String(policy.rules.length)} rules)`;
  }
  const parsed = parsePolicy(text);
  if (!parsed.ok) {
    return `${POLICY_FILE} is malformed: ${parsed.error}; keeping the ${loaded ? "last good" : "default"} policy`;
  }
  policy = parsed.policy;
  loaded = true;
  return `loaded ${POLICY_FILE} (${String(policy.rules.length)} rules)`;
}

/** Forward handlers must never throw; a failure here allows, so cosmetics fail open. */
function guard(what: string, fn: () => HookResultValue): HookResultValue {
  try {
    return fn();
  } catch (e) {
    log(`${what} failed: ${e instanceof Error ? e.message : String(e)}`);
    return HookResult.Continue;
  }
}

export function OnPluginStart(): void {
  const maul = use("@edgegamers/s2s-maul");
  const wp = use("@edgegamers/s2s-weaponpaints");
  log(loadPolicy());

  const tierOf = (req: ItemRequest): number => maul.getDsTier(req.player.steamId);

  wp.on("OnSelectionRequested", (req: ItemRequest) => guard("OnSelectionRequested", () => {
    if (allows(policy, tierOf(req), req.item)) return HookResult.Continue;
    Chat.toSlot(req.player.slot,
      `${ChatColors.Green}[DS] ${ChatColors.Default}${refusal(req.item.kind, requiredTier(policy, req.item))}`);
    return HookResult.Handled;
  }));

  wp.on("OnApplyRequested", (req: ItemRequest) => guard("OnApplyRequested", () =>
    allows(policy, tierOf(req), req.item) ? HookResult.Continue : HookResult.Handled));

  // MAUL answers after WeaponPaints has usually applied the join loadout: re-apply once it does.
  maul.on("OnDsTierChanged", (ev) => {
    for (const client of Clients.all()) {
      if (client.isValid() && client.steamId === ev.steamId) wp.refresh(client.slot);
    }
  });

  command.server("wp_ds_reload", (cmd) => {
    cmd.reply(`[WeaponPaints-DS] ${loadPolicy()}`);
    for (const client of Clients.all()) if (client.isValid() && !client.isBot) wp.refresh(client.slot);
  });
}

export function OnMapStart(): void {
  log(loadPolicy());
}
