/*!
MIT License

Copyright (c) 2026 EdgeGamers, LLC

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
import { plugin } from "@s2script/sdk/plugin";
import { Clients } from "@s2script/sdk/clients";
import type { MaulApi, MaulProfile } from "../api";
import type { Authenticator } from "./auth.ts";
import type { MaulBackend, PlayerLookup } from "./backend.ts";

function toPublicProfile(steamId: string, profile: PlayerLookup): MaulProfile {
  return {
    steamId,
    found: profile.found,
    userId: profile.userId,
    name: profile.name,
    divisionTag: profile.divisionTag,
    primaryRank: profile.primaryRank,
    groups: profile.groups.map((group) => ({ ...group })),
    ds: profile.ds === undefined ? undefined : { ...profile.ds },
    verified: profile.verified,
    ban: { ...profile.ban },
  };
}

export function createPublishedApi(ctx: { publish<T extends object>(name: string, impl: T): unknown }, auth: Authenticator, api: MaulBackend): unknown {
  return ctx.publish<MaulApi>("@edgegamers/maul", {
    profile(steamId) {
      const profile = auth.profileOf(steamId);
      return profile === null ? null : toPublicProfile(steamId, profile);
    },
    grant(steamId) {
      const grant = auth.grantOf(steamId);
      return grant === null ? null : {
        groupNames: [...grant.groupNames],
        flags: grant.flags,
        immunity: grant.immunity,
        missingGroups: [...grant.missingGroups],
      };
    },
    isVerified: (steamId) => auth.isVerified(steamId),
    refresh(slot) {
      const client = Clients.fromSlot(slot);
      if (client === null || client.isBot || client.steamId === "0") return false;
      auth.invalidate(client.steamId);
      void auth.verify(client.slot, client.steamId, false);
      return true;
    },
    backend: () => ({ version: api.version, ready: api.isReady(), description: api.describe() }),
  });
}

export default plugin((ctx) => {
  console.log("Maul plugin loaded!");
});
