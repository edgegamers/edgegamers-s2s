import { createScope, type PluginContext } from "@s2script/sdk/plugin";
import { command } from "@s2script/sdk/commands";
import { items } from "@s2script/cs2";
import { HookResult } from "@s2script/sdk/events";

// Compile-only consumers of the same load-window APIs used by OnPluginStart.
// They are never executed outside the host's plugin load window.
export function registerCurrentBindings(ctx: PluginContext): void {
  const scope = createScope();
  scope.server.onGameFrame(() => {}, { phase: "pre" });
  scope.server.onGameFrame(() => {}, { phase: "post" });
  command.onClientCommand("jointeam", (_slot, _args) => HookResult.Continue);
  ctx.commands.onClientCommand("say", (_slot, _args) => HookResult.Handled);
  items.onCanAcquire((view) => {
    const slot: number | undefined = view.player?.slot;
    void slot;
    view.result = 1;
    return HookResult.Changed;
  });
}

export function rejectUnsupportedBindings(ctx: PluginContext): void {
  // The old compatibility declaration invented this optional member; current
  // CS2 publishes imported `items`, so accepting it hides a runtime binding bug.
  // @ts-expect-error PluginContext.items is not a published current API.
  ctx.items?.onCanAcquire(() => HookResult.Continue);
  // @ts-expect-error World work must select a supported frame phase.
  ctx.server.onGameFrame(() => {}, { phase: "simulation" });
  // @ts-expect-error CanAcquire identity is observation-only.
  items.onCanAcquire((view) => { view.player = null; });
  // @ts-expect-error Engine command decisions must be synchronous.
  command.onClientCommand("say", async () => HookResult.Handled);
}
