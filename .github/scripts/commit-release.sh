#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"
git fetch --no-tags origin main

if [[ "$(git rev-parse FETCH_HEAD)" != "$(git rev-parse HEAD)" ]]; then
  echo "main advanced; the newer release run will handle it."
  echo "publish=false" >> "$GITHUB_OUTPUT"
  exit 0
fi

if [[ -n "$(git status --porcelain)" ]]; then
  git add --all
  git commit -m "chore: version plugins"
  git push origin HEAD:main
fi

echo "publish=true" >> "$GITHUB_OUTPUT"
