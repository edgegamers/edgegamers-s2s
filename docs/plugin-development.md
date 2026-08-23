# Plugin development

## Create a plugin

Run the scoped generator from the repository root. Only the first segment is
policy: it is either `global` for game-agnostic code or a game listed in
`workspace-policy.json`; any later folders are free-form:

```powershell
npm.cmd run create:plugin -- <scope>/<optional-folders>/<plugin-name>
```

For example, the existing plugins are `plugins/global/maul` and
`plugins/cs2/ttt`. Workspace detection places the generated plugin beneath
`plugins/<scope>/...`. Use an `@edgegamers/` package name, keep the generated
Source2Script metadata, and decide explicitly whether the plugin is private.

Global code may use global code only; game-scoped code may use global and
same-game code. Run `npm.cmd run workspace:check` for this focused boundary
check; `npm.cmd run lint` includes it automatically.

The generator should reuse the root toolchain. If a future SDK version generates plugin-local lint or compiler configuration that merely duplicates the root, merge required SDK-specific behavior into the root configuration before removing the duplicate.

## Build

Keep portable behavior separate from the runtime adapter. Let the Source2Script build validate plugin entry points, capabilities, manifests, and runtime-interface contracts.

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

To narrow an SDK build while iterating, use its workspace filter rather than writing a custom directory loop:

```powershell
npm.cmd run build -- --filter @edgegamers/my-plugin
```

## Publish a runtime interface

A public producer plugin's `package.json` identifies one type contract and
publishes its package name and version:

```json
{
  "name": "@edgegamers/my-api",
  "version": "0.1.0",
  "private": false,
  "types": "api.d.ts",
  "s2script": {
    "apiVersion": "1.x",
    "publishes": {
      "@edgegamers/my-api": "0.1.0"
    }
  }
}
```

Runtime-only public plugins omit `publishes` and `types`. Interface publishers
must keep the published interface version aligned through `s2s version` and
ship the declaration file referenced by `types`.

The contract is a regular declaration file:

```ts
export interface MyApi {
  doWork(): void;
}
```

The producer publishes one implementation during plugin load:

```ts
ctx.publish<MyApi>("@edgegamers/my-api", {
  doWork,
});
```

One plugin package publishes one interface contract. Split unrelated runtime services into separately owned plugins rather than combining contracts into a single declaration.

## Consume a sibling interface

The consumer declares the runtime requirement independently of npm dependencies:

```json
{
  "s2script": {
    "pluginDependencies": {
      "@edgegamers/my-api": "^0.1.0"
    }
  }
}
```

npm links workspace members, so TypeScript imports the producer's live contract from the same checkout:

```ts
import type { MyApi } from "@edgegamers/my-api";

const api = ctx.use<MyApi>("@edgegamers/my-api");
```

Do not copy a sibling declaration into `.s2script/types`. A copied declaration becomes stale, and the Source2Script workspace ignores it when a live sibling owns the contract.

Use `optionalPluginDependencies` and `ctx.tryUse` only when the plugin remains useful without the producer. Required services belong in `pluginDependencies` and use `ctx.use`.
