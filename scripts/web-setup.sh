#!/usr/bin/env bash
#
# Web/cloud environment setup for Claude Code on the web.
#
# Point this repo's environment setup-script config at this file:
#
#     bash scripts/web-setup.sh
#
# WHY THIS EXISTS
# ---------------
# The web container image ships a baked-in Node (e.g. /opt/node22) that is first
# on PATH. The frontend (frontend/, Angular 22 from F2/#15) requires Node
# ^22.22.3 || ^24.15 || >=26, so the image node throws EBADENGINE — and, more
# importantly, the harness spawns the Angular CLI MCP server (.mcp.json) at
# session START under whatever node is first on PATH. If that's the image node,
# the MCP server fails to start cleanly and is NOT retried mid-session.
#
# A committed .nvmrc cannot reorder PATH on its own. This script selects the
# pinned Node and shadows the image node so that, from the very first command of
# every session:
#   * node/npm/npx resolve to the pinned version (no EBADENGINE), and
#   * the Angular CLI MCP server connects on the first try.
#
# NOTE: the network-policy allowlist (registry.npmjs.org for the npx fetch,
# angular.dev for the MCP doc-search tool) is enforced OUTSIDE this script, in
# the environment's network-policy config. See the [F5] devops follow-up issue.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
NODE_VERSION="$(tr -d '[:space:]' < "$REPO_ROOT/.nvmrc")"

# Locate nvm (the image provides it; NVM_DIR is often unset in non-login shells).
export NVM_DIR="${NVM_DIR:-/opt/nvm}"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  for d in /opt/nvm /usr/local/share/nvm "$HOME/.nvm"; do
    if [ -s "$d/nvm.sh" ]; then NVM_DIR="$d"; break; fi
  done
fi
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  echo "web-setup: ERROR — nvm not found (looked in /opt/nvm, /usr/local/share/nvm, \$HOME/.nvm)" >&2
  exit 1
fi
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"

# Install + default the pinned Node (idempotent).
nvm install "$NODE_VERSION"
nvm alias default "$NODE_VERSION" >/dev/null

# Shadow the image node by symlinking into a bin dir that sits AHEAD of the
# image's node dir on PATH. On these images $HOME/.local/bin is first on PATH
# (the image node dir, e.g. /opt/node22/bin, precedes /usr/local/bin — so that
# is NOT a safe target). We link into $HOME/.local/bin and also mirror into
# /usr/local/bin as a fallback for images with a different PATH layout.
NODE_BIN="$NVM_DIR/versions/node/v$NODE_VERSION/bin"
for TARGET_BIN in "$HOME/.local/bin" /usr/local/bin; do
  if mkdir -p "$TARGET_BIN" 2>/dev/null && [ -w "$TARGET_BIN" ]; then
    for b in node npm npx; do
      ln -sfn "$NODE_BIN/$b" "$TARGET_BIN/$b"
    done
    echo "web-setup: linked node/npm/npx into $TARGET_BIN -> $NODE_BIN"
  fi
done

echo "web-setup: pinned node $("$NODE_BIN/node" --version) (npm $("$NODE_BIN/npm" --version)); a fresh shell should now resolve it via PATH."

# Install the frontend dependencies so the Angular CLI MCP build/test targets
# (@angular/build:application, @angular/build:unit-test) resolve their builder
# packages. Selecting Node alone is not enough: run_target does NOT auto-install,
# so without node_modules the `build`/`test` targets exit immediately with
# "Could not find the builder's node package". registry.npmjs.org is allowlisted
# by the env network policy. Idempotent: npm ci re-syncs against the lockfile.
# Use the pinned npm so the install runs under Node 26.
FRONTEND_DIR="$REPO_ROOT/frontend"
if [ -f "$FRONTEND_DIR/package-lock.json" ]; then
  echo "web-setup: installing frontend deps (npm ci) in $FRONTEND_DIR ..."
  "$NODE_BIN/npm" --prefix "$FRONTEND_DIR" ci
  echo "web-setup: frontend deps installed."
else
  echo "web-setup: no frontend/package-lock.json found; skipping frontend npm ci." >&2
fi
