# Task 4 Report: Port Grant Computation With Tests

## Result

Implemented pure MAUL grant computation in `plugins/cs2/maul/src/grant.ts` and added Node 24 `node:test` coverage in `plugins/cs2/maul/test/grant.test.ts`.

The implementation exports `GroupResolver`, `ROOT_GROUP`, `MAX_DONATOR_TIER`, `donatorGroupName`, `computeGrant`, `shouldRegisterAdmin`, `tagForRank`, and `taggedName`. It has no SDK imports.

## TDD Evidence

### RED

After creating the grant test first, ran:

```powershell
node --test plugins/cs2/maul/test/grant.test.ts
```

Expected failure occurred because `plugins/cs2/maul/src/grant.ts` was missing:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'C:\Users\reece\VSCodeProjects\edgegamers-s2s\plugins\cs2\maul\src\grant.ts'
tests 1
pass 0
fail 1
```

### GREEN

After implementing the minimal pure grant module, reran the same command:

```powershell
node --test plugins/cs2/maul/test/grant.test.ts
```

```text
tests 7
pass 7
fail 0
```

The tests cover flag union and maximum immunity, eventserver gating, rank 95 root inheritance, clamped stacked DS tiers, missing groups, admin registration, and rank tagging.

## Verification

Ran the complete MAUL test set:

```powershell
node --test plugins/cs2/maul/test/*.test.ts
```

```text
tests 16
pass 16
fail 0
```

Ran `git diff --check`; it passed with no whitespace errors.

Attempted the package build:

```powershell
npm run build --workspace @edgegamers/maul
```

The build is currently blocked by the existing MAUL `tsconfig.json` excluding `test/*.ts` from the TypeScript project. The linter reports the same project-service parsing error for `encoding.test.ts`, `rank-table.test.ts`, and the new `grant.test.ts`. No build configuration was changed because it is outside Task 4 scope.

## Commit

The implementation, tests, and this report are committed on the existing `dev` checkout.
