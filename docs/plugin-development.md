# Plugin development

## Create a plugin

Run the pinned Source2Script generator from the repository root:

```powershell
npm.cmd run create:plugin -- my-plugin
```

Workspace detection places the plugin beneath `plugins/my-plugin`. Use an `@edgegamers/` package name, keep the generated Source2Script metadata, and decide explicitly whether the plugin is private.

The generator should reuse the root toolchain. If a future SDK version generates plugin-local lint or compiler configuration that merely duplicates the root, merge required SDK-specific behavior into the root configuration before removing the duplicate.

## Build

Keep portable behavior separate from the runtime adapter. Let the Source2Script build validate plugin entry points, capabilities, manifests, and runtime-interface contracts.

```powershell
npm.cmd run typecheck
npm.cmd run build
```

To narrow an SDK build while iterating, use its workspace filter rather than writing a custom directory loop:

```powershell
npm.cmd run build -- --filter @edgegamers/my-plugin
```

## Publish a runtime interface

A producer plugin's `package.json` identifies one type contract and publishes the package's own name and version:

```json
{
  "name": "@edgegamers/my-api",
  "version": "0.1.0",
  "types": "api.d.ts",
  "s2script": {
    "publishes": "self"
  }
}
```

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
