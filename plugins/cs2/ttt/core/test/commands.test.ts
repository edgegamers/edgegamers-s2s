import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CtxCommands } from "@s2script/sdk/plugin";
import type { TttCoreApi } from "../api.d.ts";
import { registerCoreCommands } from "../src/commands.ts";
import { createPlayerRegistry } from "../src/players.ts";
import { createRoleRegistry } from "../src/roles.ts";
import type { TttRuntime } from "../src/runtime.ts";

describe("TTT core commands", () => {
  it("registers round logs as an admin-only command", () => {
    const publicCommands: string[] = [];
    const adminCommands: string[] = [];
    const commands = {
      register: (name: string) => { publicCommands.push(name); },
      registerAdmin: (name: string) => { adminCommands.push(name); },
    } as unknown as CtxCommands;
    const roles = createRoleRegistry();
    const players = createPlayerRegistry(roles);

    registerCoreCommands(commands, {
      api: {} as TttCoreApi,
      runtime: {} as TttRuntime,
      roles,
      players,
      genericAdminFlag: 2,
      rootAdminFlag: 16_384,
    });

    assert.equal(publicCommands.includes("sm_ttt_logs"), false);
    assert.equal(adminCommands.includes("sm_ttt_logs"), true);
  });
});
