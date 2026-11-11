// @edgegamers/s2s-weaponpaints-ds — gates WeaponPaints items by MAUL Dedicated Supporter tier.
//
// WeaponPaints asks (OnSelectionRequested, OnApplyRequested); this plugin answers from the policy
// file and the tier MAUL cached on connect. Remove this plugin and WeaponPaints is ungated again.
// With `policy_url` set, the policy comes from the CS portal at every map start, and the file keeps
// the last good copy for when the portal cannot be reached.
// A refused apply only shows the default item: the player's saved rows are never touched, so a
// lapsed supporter gets everything back on resubscribing.

import { Clients, command, config, HookResult, publish, use } from "@s2script/sdk";
import { fetch } from "@s2script/sdk/http";
import type { HookResultValue } from "@s2script/sdk";
import type { ItemRequest } from "@edgegamers/s2s-weaponpaints";
import { allows, DEFAULT_POLICY, parsePolicy, requiredTier, type Policy } from "./policy.ts";
import { loadPhrases, refuseSelection } from "./messages.ts";

/** The one WeaponPaints method this plugin calls. */
type WeaponPaints = { refresh(slot: number): boolean };

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

/**
 * Fetch the policy from the portal. A good answer replaces the policy and the file (the last good
 * copy); anything else is logged and the current policy stays. Re-applies items when it changed.
 */
async function fetchPolicy(wp: WeaponPaints, bustCache = false): Promise<void> {
  const base = config.getString("policy_url").trim();
  if (base === "") return;
  // After a change notice, skip any HTTP cache in between (the endpoint allows 30 s of caching).
  const url = bustCache ? `${base}${base.includes("?") ? "&" : "?"}t=${String(Date.now())}` : base;
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    const agent = config.getString("user_agent").trim();
    if (agent !== "") headers["User-Agent"] = agent;
    const res = await fetch(url, { method: "GET", headers, timeoutMs: config.getInt("http_timeout_ms") });
    if (!res.ok) {
      log(`policy fetch from ${url} failed: HTTP ${String(res.status)}; keeping the current policy`);
      return;
    }
    const parsed = parsePolicy(res.text());
    if (!parsed.ok) {
      log(`policy from ${url} is malformed: ${parsed.error}; keeping the current policy`);
      return;
    }
    const before = JSON.stringify(policy);
    policy = parsed.policy;
    loaded = true;
    config.writeFile(POLICY_FILE, JSON.stringify(policy, null, 2) + "\n");
    const changed = JSON.stringify(policy) !== before;
    log(`fetched the policy from ${url} (${String(policy.rules.length)} rules${changed ? ", changed" : ""})`);
    if (changed) refreshAll(wp);
  } catch (e) {
    log(`policy fetch from ${url} failed: ${e instanceof Error ? e.message : String(e)}; keeping the current policy`);
  }
}

function refreshAll(wp: WeaponPaints): void {
  for (const client of Clients.all()) if (client.isValid() && !client.isBot) wp.refresh(client.slot);
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

let weaponPaints: WeaponPaints | null = null;

export function OnPluginStart(): void {
  loadPhrases();
  publish("@edgegamers/s2s-weaponpaints-ds", {
    reloadPolicy: (): void => {
      if (weaponPaints) void fetchPolicy(weaponPaints, true);
    },
  });
  const maul = use("@edgegamers/s2s-maul");
  const wp = use("@edgegamers/s2s-weaponpaints");
  weaponPaints = wp;
  log(loadPolicy());
  void fetchPolicy(wp);

  const tierOf = (req: ItemRequest): number => maul.getDsTier(req.player.steamId);

  wp.on("OnSelectionRequested", (req: ItemRequest) => guard("OnSelectionRequested", () => {
    if (allows(policy, tierOf(req), req.item)) return HookResult.Continue;
    refuseSelection(req.player.slot, req.item.kind, requiredTier(policy, req.item));
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
    refreshAll(wp);
    void fetchPolicy(wp);
  });
}

export function OnMapStart(): void {
  log(loadPolicy());
  if (weaponPaints) void fetchPolicy(weaponPaints);
}
