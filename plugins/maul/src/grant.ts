// src/grant.ts — the admin-grant fold. PURE: zero I/O, zero SDK imports. The unit-test target.
//
// s2script has no AdminInheritGroup, so SM's `CreateAdmin` + repeated `AdminInheritGroup`
// (maul_authentication.sp:161-236) is reproduced by resolving each group name to its
// {flags, immunity} and folding: flags union, immunity max.

import { RANK_SUPER } from "./types.ts";
import type { Grant, GrantEnv, RankTable, ResolvedGroup, WireDsInfo, WireUserGroup } from "./types.ts";

/** Resolves an admin_groups.json group name, or null when the group is not defined. */
export type GroupResolver = (name: string) => ResolvedGroup | null;

/** The `root` group rank 95 additionally inherits (SM: maul_authentication.sp:198-201). */
export const ROOT_GROUP = "root";

/** Upper bound on donator tiers, so bad API data cannot spin the tier loop. MAUL ships 4. */
export const MAX_DONATOR_TIER = 8;

/** DS tier N inherits donator_tier1..donator_tierN. */
export function donatorGroupName(tier: number): string {
  return `donator_tier${tier}`;
}

/**
 * Fold every group this player inherits into one {flags, immunity} grant.
 *
 * Order matches SM: secondary groups (event-gated), then rank-95's root, then the primary rank
 * group (never event-gated), then DS tiers.
 */
export function computeGrant(
  input: {
    groups: WireUserGroup[];
    primaryRank: number;
    ds: WireDsInfo | undefined;
  },
  table: RankTable,
  env: GrantEnv,
  resolve: GroupResolver,
): Grant {
  const grant: Grant = { groupNames: [], flags: 0, immunity: 0, missingGroups: [] };

  const inherit = (name: string): void => {
    if (grant.groupNames.includes(name)) return;

    const group = resolve(name);
    if (group === null) {
      if (!grant.missingGroups.includes(name)) grant.missingGroups.push(name);
      return;
    }

    grant.groupNames.push(name);
    grant.flags |= group.flags;
    if (group.immunity > grant.immunity) grant.immunity = group.immunity;
  };

  for (const group of input.groups) {
    const entry = table.ranks[String(group.rank)];
    // An event-gated rank contributes nothing while the server is not an event server.
    if (entry !== undefined && (!entry.special || env.eventserver)) inherit(entry.group);
    if (group.rank === RANK_SUPER) inherit(ROOT_GROUP);
  }

  const primary = table.ranks[String(input.primaryRank)];
  if (primary !== undefined) inherit(primary.group);

  // Clamped: a nonsense tier from the API must not spin this loop.
  const tier = input.ds?.ds === true ? Math.min(input.ds.tier ?? 0, MAX_DONATOR_TIER) : 0;
  for (let t = 1; t <= tier; t++) inherit(donatorGroupName(t));

  return grant;
}

/**
 * SM parity (maul_authentication.sp:238-243): the admin id is only installed when it carries
 * immunity. Below that the player stays a pub user.
 */
export function shouldRegisterAdmin(grant: Grant): boolean {
  return grant.immunity > 0;
}

/** The name tag for a primary rank, or null when the rank has no tag configured. */
export function tagForRank(primaryRank: number, table: RankTable): string | null {
  const tag = table.ranks[String(primaryRank)]?.tag;
  return tag !== undefined && tag.trim().length > 0 ? tag : null;
}

/**
 * The autotagged display name: `"{tag} {maulName}"`, or null when no tag applies or MAUL has no
 * name on file (SM leaves the client's own name alone in that case).
 */
export function taggedName(
  maulName: string | undefined,
  primaryRank: number,
  table: RankTable,
): string | null {
  const name = maulName?.trim();
  if (name === undefined || name.length === 0) return null;

  const tag = tagForRank(primaryRank, table);
  return tag === null ? name : `${tag} ${name}`;
}
