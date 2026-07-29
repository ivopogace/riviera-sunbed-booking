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
# THREE STEPS, BECAUSE `install` ALONE PINS THE PAYLOAD
# The plugin — not a vendored copy — stays the source of truth, so this script has
# to both repair a missing payload AND track upstream. Those are different commands:
#
#   1. `claude plugin marketplace update <marketplace>` — refreshes the marketplace
#      clone from its source. Without this, steps 2-3 can only ever see the revision
#      that clone was last fetched at.
#   2. `claude plugin install <p> --scope project` — idempotent AND self-healing:
#        - payload present  → "already installed", no change
#        - payload missing  → refetches it, "Successfully installed"
#      It does not rewrite `.claude/settings.json` (verified), so it cannot dirty the
#      working tree. But note the first branch: install is a **no-op when the payload
#      exists**, so on its own it would pin the plugin at whatever revision landed
#      first, forever.
#   3. `claude plugin update <p> --scope project` — advances an already-present
#      payload to the marketplace's latest revision. The `--scope project` flag is
#      load-bearing: the command defaults to **user** scope and fails with
#      `Plugin "<p>" is not installed at scope user` for a project-scoped plugin.
#      (An earlier revision of this header called `update` unusable for that reason;
#      it is usable, it just needs the flag.) It also exits 0 on that failure, so its
#      exit status cannot be trusted as a signal — best-effort is the only posture.
#
# Caveat, stated rather than overclaimed: the CLI reports "restart required to apply"
# for an update. A payload REPAIRED here (step 2) is on disk before the registry is
# built and so is available this session; a payload UPGRADED here (step 3) may not
# take effect until the next session. Tracking upstream is therefore eventually
# consistent by one session — acceptable, since the gate's availability (step 2) is
# the part that must be immediate.
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
REFRESHED=""
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

  # Step 1 — refresh the marketplace once per marketplace, not once per plugin.
  case " $REFRESHED " in
    *" $marketplace "*) ;;
    *)
      claude plugin marketplace update "$marketplace" >/dev/null 2>&1 \
        || echo "ensure-plugins: could not refresh $marketplace; using its last-fetched revision." >&2
      REFRESHED="$REFRESHED $marketplace"
      ;;
  esac

  # Step 2 — repair a missing payload (the #421 race). Immediate: this session.
  if claude plugin install "$id" --scope project >/dev/null 2>&1; then
    echo "ensure-plugins: $id ready." >&2
  else
    echo "ensure-plugins: could not install $id — its skills will be missing this session." >&2
    continue
  fi

  # Step 3 — track upstream. `--scope project` is required (see header); the command
  # exits 0 even when it fails, so this is advisory only and never gates anything.
  claude plugin update "$id" --scope project >/dev/null 2>&1 || true
done

exit 0
