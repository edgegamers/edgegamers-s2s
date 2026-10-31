#!/usr/bin/env bash
# The whole gate, locally and in CI: shared-lib declarations are fresh, its unit tests pass, and
# every plugin builds (typecheck + lint + protocol-2 contract checks) via `s2s build`.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== shared: regenerate declarations"
(cd packages/shared && ../../node_modules/.bin/tsc -p tsconfig.build.json)
git diff --exit-code -- packages/shared/types || {
  echo "packages/shared/types is stale — run: (cd packages/shared && npm run types) and commit" >&2
  exit 1
}

echo "== shared: unit tests"
npm test --silent

echo "== plugin unit tests"
for t in plugins/*/test; do
  [ -d "$t" ] || continue
  node --experimental-strip-types --no-warnings --test "$t"/*.test.ts
done

echo "== s2s build (every plugin)"
npx s2s build
