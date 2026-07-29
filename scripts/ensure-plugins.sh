#!/bin/bash
#
# Materialize the plugins this repo enables, so their skills exist when Claude
# Code builds its skill registry.
#
# Called from scripts/cloud-session-setup.sh (SessionStart hook, step 5); also
# safe to run by hand at any time.
#
# THE BUG THIS FIXES
# `.claude/settings.json` enables `code-review@claude-plugins-official` (the SDLC
# review gate) and `frontend-design@...`. Enabling records an intent; it does not
# guarantee the payload is on disk. In a fresh cloud container the payload is
# fetched lazily and reference-counted (`~/.claude/plugins/cache/<marketplace>/
# <plugin>/<version>/`, with `.in_use/` PID markers), and the registry that decides
# which skills exist is built ONCE at session start. Lose that race and
# `/code-review` is simply absent for the whole session — `claude plugin list`
# still says "installed √ enabled", because it trusts the install record in
# `~/.claude/plugins/installed_plugins.json` without checking that `installPath`
# exists. Observed 2026-07-29: install recorded at 16:03, payload materialized at
# 16:19, invocation at 15:55 → `Unknown skill`, and the SDLC review gate silently
# fell back to `/review` for a whole PR (#420).
#
# WHY `install` IS THE REPAIR
# `claude plugin install <p> --scope project` is idempotent AND self-healing:
#   - payload present  → "already installed", no change
#   - payload missing  → refetches it, "Successfully installed"
# It does not rewrite `.claude/settings.json` (verified), so it cannot dirty the
# working tree. `claude plugin update` is NOT usable here: it defaults to user
# scope and errors out for a project-scoped plugin.
#
# Because the SessionStart hook is SYNCHRONOUS and the container image is cached
# after it completes, doing this here means the payload is on disk before the
# registry is built — this session and every cached one after it.
#
# Best-effort throughout: a plugin that will not install must never abort session
# setup. Exits 0 unless it cannot even find the settings file.
set -u

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
SETTINGS="$PROJECT_DIR/.claude/settings.json"

command -v claude >/dev/null 2>&1 || {
  echo "ensure-plugins: no 'claude' CLI on PATH; skipping." >&2
  exit 0
}
[ -f "$SETTINGS" ] || {
  echo "ensure-plugins: $SETTINGS not found; nothing to do." >&2
  exit 0
}

# The enabled set is read from settings.json rather than hardcoded, so adding a
# plugin there is the only edit a future change needs.
PLUGINS=$(python3 -c '
import json, sys
try:
    enabled = json.load(open(sys.argv[1])).get("enabledPlugins", {})
except Exception as exc:                       # malformed settings must not abort setup
    print("ensure-plugins: could not parse settings.json: %s" % exc, file=sys.stderr)
    raise SystemExit(0)
print("\n".join(name for name, on in enabled.items() if on))
' "$SETTINGS" 2>/dev/null)

[ -n "$PLUGINS" ] || {
  echo "ensure-plugins: no enabled plugins declared; nothing to do." >&2
  exit 0
}

# A plugin id is <plugin>@<marketplace>; the marketplace must be registered before
# an install can resolve it. Only this repo's marketplace is known here by name —
# there is no general mapping from a marketplace name back to its source.
for id in $PLUGINS; do
  marketplace="${id##*@}"
  if ! claude plugin marketplace list 2>/dev/null | grep -q "$marketplace"; then
    if [ "$marketplace" = "claude-plugins-official" ]; then
      echo "ensure-plugins: registering marketplace $marketplace ..." >&2
      claude plugin marketplace add anthropics/claude-plugins-official >/dev/null 2>&1 \
        || echo "ensure-plugins: could not add $marketplace; ${id%%@*} will be unavailable." >&2
    else
      echo "ensure-plugins: marketplace $marketplace is not registered and its source is unknown; skipping ${id%%@*}." >&2
      continue
    fi
  fi

  # Idempotent + self-healing; see the header note.
  if claude plugin install "$id" --scope project >/dev/null 2>&1; then
    echo "ensure-plugins: $id ready." >&2
  else
    echo "ensure-plugins: could not install $id — its skills will be missing this session." >&2
  fi
done

exit 0
