#!/bin/bash
#
# SessionStart hook — installs frontend deps in CLOUD sessions only.
#
# Registered in .claude/settings.json under hooks.SessionStart.
#
# WHY A HOOK (not the env setup script):
# The env setup script selects Node 26 BEFORE Claude Code launches (so the
# Angular CLI MCP server spawns under it), but it runs before the repo is
# checked out, so it cannot install frontend deps. This hook runs AFTER
# checkout (with $CLAUDE_PROJECT_DIR available), which is the supported place
# for a repo-dependent `npm install`. It makes `frontend/node_modules` present
# so the Angular MCP build/test targets (@angular/build:application,
# @angular/build:unit-test via run_target) can resolve their builder packages.
#
# Local sessions are skipped — developers manage their own deps. Idempotent:
# skips when node_modules already exists (e.g. on resume), per the docs'
# guidance to keep SessionStart hooks fast.
set -u

# Cloud-only: CLAUDE_CODE_REMOTE is "true" in Claude Code on the web.
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

# Ensure the env-setup-script's pinned Node 26 / npm win on PATH.
export PATH="$HOME/.local/bin:$PATH"

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
FRONTEND_DIR="$PROJECT_DIR/frontend"

# Already installed (fresh container may carry it via cache, or a resume) — skip.
[ -d "$FRONTEND_DIR/node_modules" ] && exit 0

if [ -f "$FRONTEND_DIR/package-lock.json" ]; then
  echo "cloud-session-setup: installing frontend deps (npm ci) in $FRONTEND_DIR ..." >&2
  npm --prefix "$FRONTEND_DIR" ci \
    || echo "cloud-session-setup: npm ci failed (continuing; run_target build/test may need a manual npm ci)" >&2
fi

exit 0
