import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { buildSync } from "esbuild";
import { chatColors } from "./chat-colors.mjs";

const source = buildSync({ entryPoints: [new URL("../src/phrases.ts", import.meta.url).pathname], bundle: true,
  write: false, platform: "node", format: "cjs", external: ["@s2script/*"] }).outputFiles[0].text;

test("positional phrase arguments cannot inject color bytes or markup into chat and console replies", () => {
  let phrases;
  const sdk = { Activity: {}, Translations: {
    load(_name, seed) { phrases = seed; },
    translate(_slot, key, ...args) {
      return phrases[key].replace(/\{(\d+)\}/g, (_, n) => String(args[Number(n) - 1] ?? "").replace(/[{}]/g, ""));
    },
  } };
  const module = { exports: {} };
  vm.runInContext(source, vm.createContext({ module, exports: module.exports, require(name) {
    if (name === "@s2script/sdk") return sdk;
    if (name === "@s2script/cs2") return { ChatColors: chatColors };
    throw Error(name);
  } }));
  const api = module.exports; api.loadPhrases();
  const messages = [];
  const cmd = { callerSlot: 1, replySource: "chat", reply: text => messages.push(text) };
  api.replyPhrase(cmd, "extracommands.give.give_to_players", 1, "weapon_{red}\x07ak47");
  assert.equal(messages[0], "\x0bAdmin \x08» \x10Gave\x08 \x04weapon_redak47\x08 to \x091\x08 player(s).");
  cmd.replySource = "console";
  api.replyPhrase(cmd, "extracommands.give.give_to_players", 1, "weapon_{red}\x07ak47");
  assert.equal(messages[1], "Admin » Gave weapon_redak47 to 1 player(s).");
  cmd.replySource = "chat";
  api.replyPhrase(cmd, "extracommands.oneup.scheduling_failed");
  assert.ok(messages[2].includes("\x02Error: \x01"), "true errors use dark red with white emphasis");
  assert.equal(/\{[a-z]+\}/i.test(messages[2]), false, "chat expands all semantic color tags");
});
