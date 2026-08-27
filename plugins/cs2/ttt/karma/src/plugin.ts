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
import { config } from "@s2script/sdk/config";
import { Clients } from "@s2script/sdk/clients";
import { Server } from "@s2script/sdk/server";
import type { TttCoreApi } from "@edgegamers/ttt-core";
import type { TttKarmaApi } from "../api";
import { registerKarmaCommands } from "./commands.ts";
import { installKarmaEvents } from "./events.ts";
import { createKarmaService } from "./karma.ts";
import { createKarmaConfigSnapshot } from "./config.ts";

export default plugin((ctx) => {
  const core = ctx.use<TttCoreApi>("@edgegamers/ttt-core");
  let settings = createKarmaConfigSnapshot(config);
  const karma = createKarmaService(() => settings, {
    onLowKarma(slot, command) {
      if (command === "") return;
      const player = Clients.fromSlot(slot);
      if (player === null) return;
      Server.command(command.replace("{0}", String(player.userId)));
    },
  });

  registerKarmaCommands(ctx.commands, core, karma);
  installKarmaEvents(core, karma);

  ctx.config.onChange(() => { settings = createKarmaConfigSnapshot(config); });
  ctx.publish<TttKarmaApi>("@edgegamers/ttt-karma", karma);
  console.log("[ttt-karma] loaded");
});
