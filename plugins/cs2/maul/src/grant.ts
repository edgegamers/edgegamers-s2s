import { RANK_SUPER } from "./types.ts";
import type { Grant, GrantEnv, RankTable, ResolvedGroup, WireDsInfo, WireUserGroup } from "./types.ts";

export const ROOT_GROUP = "root";
export const MAX_DONATOR_TIER = 8;

export type GroupResolver = (name: string) => ResolvedGroup | null;

type GrantInput = {
  groups: WireUserGroup[];
  primaryRank: number;
  ds?: WireDsInfo;
};

function addGroup(grant: Grant, name: string, resolve: GroupResolver): void {
  if (grant.groupNames.includes(name)) return;
  const group = resolve(name);
  if (group === null) {
    grant.missingGroups.push(name);
    return;
  }
  grant.groupNames.push(name);
  grant.flags |= group.flags;
  grant.immunity = Math.max(grant.immunity, group.immunity);
}

function addRank(grant: Grant, rank: number, table: RankTable, env: GrantEnv, resolve: GroupResolver): void {
  if (rank === RANK_SUPER) {
    addGroup(grant, ROOT_GROUP, resolve);
    return;
  }
  const entry = table.ranks[String(rank)];
  if (entry === undefined || (entry.special === true && !env.eventserver)) return;
  addGroup(grant, entry.group, resolve);
}

export function donatorGroupName(tier: number): string {
  return `donator_tier${tier}`;
}

export function computeGrant(input: GrantInput, table: RankTable, env: GrantEnv, resolve: GroupResolver): Grant {
  const grant: Grant = { groupNames: [], flags: 0, immunity: 0, missingGroups: [] };
  for (const group of input.groups) addRank(grant, group.rank, table, env, resolve);
  addRank(grant, input.primaryRank, table, env, resolve);

  const rawTier = input.ds?.ds === true ? input.ds.tier : undefined;
  if (typeof rawTier === "number" && Number.isFinite(rawTier)) {
    const tier = Math.max(0, Math.min(MAX_DONATOR_TIER, Math.floor(rawTier)));
    for (let current = 1; current <= tier; current += 1) addGroup(grant, donatorGroupName(current), resolve);
  }
  return grant;
}

export function shouldRegisterAdmin(grant: Grant): boolean {
  return grant.immunity > 0;
}

export function tagForRank(rank: number, table: RankTable): string | null {
  return table.ranks[String(rank)]?.tag ?? null;
}

export function taggedName(name: string, primaryRank: number, table: RankTable): string | null {
  if (name.length === 0) return null;
  const tag = tagForRank(primaryRank, table);
  return tag === null ? name : `${tag} ${name}`;
}
