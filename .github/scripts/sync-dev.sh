#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"

published_head=$(git rev-parse HEAD)
git fetch --no-tags origin main
if [[ "$(git rev-parse FETCH_HEAD)" != "$published_head" ]]; then
  echo 'main advanced; its release run will synchronize dev.'
  echo 'synced=false' >> "$GITHUB_OUTPUT"
  exit 0
fi

git diff --exit-code --quiet
git diff --cached --exit-code --quiet

if git ls-remote --exit-code --heads origin refs/heads/dev > /dev/null; then
  git fetch --no-tags origin dev
  dev_head=$(git rev-parse FETCH_HEAD)
  if git merge-base --is-ancestor "$published_head" "$dev_head"; then
    echo 'dev already contains the published main.'
    echo 'synced=false' >> "$GITHUB_OUTPUT"
    echo "dev_sha=$dev_head" >> "$GITHUB_OUTPUT"
    exit 0
  fi
  git switch --detach "$dev_head"
  if ! git merge --no-edit "$published_head"; then
    git merge --abort
    echo 'main and dev conflict. Resolve them in a main-to-dev PR, then retry synchronization.' >&2
    exit 1
  fi
else
  result=$?
  if [[ "$result" != 2 ]]; then
    echo 'Could not check whether dev exists.' >&2
    exit "$result"
  fi
fi

# A concurrent dev push is rejected rather than overwritten. Retrying merges its new head.
git push origin HEAD:refs/heads/dev
echo 'synced=true' >> "$GITHUB_OUTPUT"
echo "dev_sha=$(git rev-parse HEAD)" >> "$GITHUB_OUTPUT"
