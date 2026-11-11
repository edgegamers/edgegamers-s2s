import { describe, expect, it } from "bun:test";
import { notFound } from "../src/backend.ts";
import type { PlayerLookup } from "../src/backend.ts";
import {
  channelLabel,
  cleanChatText,
  isLeadership,
  receives,
  routeStaffChat,
} from "../src/staff-chat.ts";

const CFG = { dsChat: true, leadershipChat: true, leadershipMinRank: 60 };

function profile(over: Partial<PlayerLookup>): PlayerLookup {
  return { ...notFound(), found: true, ...over };
}

const pub = profile({});
const ds = profile({ ds: { ds: true, tier: 2 } });
const manager = profile({ primaryRank: 60 });
const ego = profile({ primaryRank: 30 });

describe("routeStaffChat", () => {
  it("sends $ in team chat from a supporter to the DS channel", () => {
    expect(routeStaffChat("$ hello", true, ds, CFG)).toEqual({ channel: "ds", body: "hello" });
  });

  it("lets $ through as normal chat for everyone else, and in all chat", () => {
    expect(routeStaffChat("$5 says B", true, pub, CFG)).toBeNull();
    expect(routeStaffChat("$hi", true, null, CFG)).toBeNull();
    expect(routeStaffChat("$hi", false, ds, CFG)).toBeNull();
    expect(routeStaffChat("$hi", true, profile({ ds: { ds: false, tier: 2 } }), CFG)).toBeNull();
  });

  it("routes a leader's % by chat channel", () => {
    expect(routeStaffChat("%hi", true, manager, CFG)).toEqual({ channel: "leadership", body: "hi" });
    expect(routeStaffChat("%hi", false, manager, CFG)).toEqual({ channel: "leadershipAll", body: "hi" });
  });

  for (const teamonly of [false, true]) {
    it(`routes non-leadership % to leadership in ${teamonly ? "team" : "all"} chat`, () => {
      for (const sender of [pub, ds, ego, null, notFound()]) {
        expect(routeStaffChat("% hello", teamonly, sender, CFG)).toEqual({ channel: "leadershipTo", body: "hello" });
      }
    });

    it(`reserves %% for leadership in ${teamonly ? "team" : "all"} chat`, () => {
      expect(routeStaffChat("%%player hello", teamonly, manager, CFG)).toEqual({ channel: "leadershipPrivate", target: "player", body: "hello" });
      for (const sender of [pub, ds, ego, null]) expect(routeStaffChat("%%player hello", teamonly, sender, CFG)).toBeNull();
      expect(routeStaffChat("%%player hello", teamonly, manager, { ...CFG, leadershipChat: false })).toBeNull();
    });
  }

  it("honours the config switches", () => {
    expect(routeStaffChat("$hi", true, ds, { ...CFG, dsChat: false })).toBeNull();
    expect(routeStaffChat("%hi", true, manager, { ...CFG, leadershipChat: false })).toBeNull();
    expect(routeStaffChat("%hi", true, ego, { ...CFG, leadershipMinRank: 30 })?.channel).toBe("leadership");
  });

  it("ignores ordinary lines", () => {
    expect(routeStaffChat("hello", true, manager, CFG)).toBeNull();
    expect(routeStaffChat("", true, manager, CFG)).toBeNull();
  });
});

describe("isLeadership", () => {
  it("uses the highest of the primary and group ranks", () => {
    expect(isLeadership(profile({ primaryRank: 30, groups: [{ rank: 70 }] }), 60)).toBe(true);
    expect(isLeadership(profile({ primaryRank: 30, groups: [{ rank: 31 }] }), 60)).toBe(false);
    expect(isLeadership(notFound(), 0)).toBe(false);
  });
});

describe("receives", () => {
  it("delivers DS lines to supporters and the sender", () => {
    expect(receives("ds", ds, false, CFG)).toBe(true);
    expect(receives("ds", manager, false, CFG)).toBe(false);
    expect(receives("ds", pub, true, CFG)).toBe(true);
  });

  it("delivers leadership lines to leadership, and broadcasts to everyone", () => {
    expect(receives("leadership", manager, false, CFG)).toBe(true);
    expect(receives("leadership", ds, false, CFG)).toBe(false);
    expect(receives("leadershipAll", null, false, CFG)).toBe(true);
  });
});

describe("formatting", () => {
  it("labels each channel", () => {
    expect(channelLabel("ds")).toBe("(DS)");
    expect(channelLabel("leadership")).toBe("(LEADERSHIP)");
    expect(channelLabel("leadershipAll")).toBe("(LEADERSHIP TO ALL)");
  });

  it("strips control bytes from player text", () => {
    expect(cleanChatText("a\x02b\x10c")).toBe("abc");
  });
});
