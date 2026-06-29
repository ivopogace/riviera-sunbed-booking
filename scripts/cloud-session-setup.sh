#!/bin/bash
#
# SessionStart hook — provisions this repo's toolchain in CLOUD sessions only.
#
# Registered in .claude/settings.json under hooks.SessionStart.
#
# WHY A HOOK (not the env setup script):
# The env setup script selects Node 26 BEFORE Claude Code launches (so the
# Angular CLI MCP server spawns under it), but it runs before the repo is
# checked out, so it cannot do repo-dependent provisioning. This hook runs
# AFTER checkout (with $CLAUDE_PROJECT_DIR available), the supported place for it.
#
# Four idempotent, cloud-only steps:
#   1. Frontend deps — `npm ci` so the Angular CLI MCP build/test targets
#      (@angular/build:application, @angular/build:unit-test via run_target)
#      resolve their builder packages.
#   2. Backend JDK 25 — platform/build.gradle targets JavaLanguageVersion.of(25),
#      but the image ships only JDK 21 and no foojay resolver is configured, so
#      ./gradlew can't otherwise provision the toolchain.
#   3. JDK trusts the agent-proxy CA so ./gradlew's HTTPS works.
#   4. Docker daemon for the backend Testcontainers ITs.
#
# Local sessions are skipped (CLAUDE_CODE_REMOTE != true) — developers manage
# their own toolchain.
set -u

# Cloud-only: CLAUDE_CODE_REMOTE is "true" in Claude Code on the web.
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

# Ensure the env-setup-script's pinned Node 26 / npm win on PATH.
export PATH="$HOME/.local/bin:$PATH"

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# ── 1. Frontend deps (idempotent: skip when node_modules already present) ──
FRONTEND_DIR="$PROJECT_DIR/frontend"
if [ ! -d "$FRONTEND_DIR/node_modules" ] && [ -f "$FRONTEND_DIR/package-lock.json" ]; then
  echo "cloud-session-setup: installing frontend deps (npm ci) in $FRONTEND_DIR ..." >&2
  npm --prefix "$FRONTEND_DIR" ci \
    || echo "cloud-session-setup: npm ci failed (run_target build/test may need a manual npm ci)" >&2
fi

# ── 2. Backend JDK 25 (idempotent: skip when /opt/jdk-25 is already 25) ──
JDK_DIR=/opt/jdk-25
if ! { [ -x "$JDK_DIR/bin/java" ] && "$JDK_DIR/bin/java" -version 2>&1 | grep -q 'version "25'; }; then
  echo "cloud-session-setup: installing Temurin JDK 25 (backend toolchain) ..." >&2
  # GitHub release assets are allowlisted (github.com / *.githubusercontent.com);
  # api.adoptium.net is NOT, so a direct Adoptium-API download 403s. Resolve the
  # latest linux-x64 asset via api.github.com (allowlisted) and pull the tarball.
  asset=$(curl -fsSL "https://api.github.com/repos/adoptium/temurin25-binaries/releases/latest" \
    | grep -oE 'https://[^"]+OpenJDK25U-jdk_x64_linux_hotspot_[0-9._]+\.tar\.gz' | head -1)
  if [ -n "$asset" ]; then
    tmp=$(mktemp)
    if curl -fsSL --retry 2 -o "$tmp" "$asset"; then
      rm -rf "$JDK_DIR" && mkdir -p "$JDK_DIR"
      tar -xzf "$tmp" -C "$JDK_DIR" --strip-components=1
      echo "cloud-session-setup: $("$JDK_DIR/bin/java" -version 2>&1 | grep -i version | head -1) installed." >&2
    else
      echo "cloud-session-setup: JDK 25 download failed (backend ./gradlew build will need JDK 25)" >&2
    fi
    rm -f "$tmp"
  else
    echo "cloud-session-setup: could not resolve a Temurin 25 asset URL" >&2
  fi
fi

# Make JDK 25 the session default. Gradle auto-detects JDKs in /opt, but set
# JAVA_HOME + PATH so `java`/`./gradlew` use it too. Persist for subsequent Bash
# commands via $CLAUDE_ENV_FILE (keeps the Node-26 dir ahead of the image node).
if [ -x "$JDK_DIR/bin/java" ] && [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  {
    echo "JAVA_HOME=$JDK_DIR"
    echo "PATH=$JDK_DIR/bin:$PATH"
  } >> "$CLAUDE_ENV_FILE"
fi

# ── 3. JDK trusts the agent-proxy CA (so ./gradlew works) ─────────────────
# The wrapper download + dependency resolution go through the policy proxy; if the
# managed JVM truststore seed failed, the JDK's default cacerts won't trust the proxy
# CA and ./gradlew dies with PKIX errors. Import the CA into the JDK cacerts. Runs
# AFTER the JDK step so it targets the freshly-installed cacerts. Best-effort.
# See scripts/trust-proxy-ca-java.sh and docs/agents/gradle-proxy-trust.md.
TRUST_SCRIPT="$PROJECT_DIR/scripts/trust-proxy-ca-java.sh"
if [ -x "$TRUST_SCRIPT" ]; then
  echo "cloud-session-setup: trusting agent-proxy CA for the JDK ..." >&2
  "$TRUST_SCRIPT" \
    || echo "cloud-session-setup: trust-proxy-ca-java failed; ./gradlew may hit PKIX (run 'bash scripts/trust-proxy-ca-java.sh' to retry)" >&2
fi

# ── 4. Docker daemon (backend Testcontainers ITs) ─────────────────────────
# The backend ITs are gated by @EnabledIfDockerAvailable and SKIP when no daemon
# is running (the cloud default), so ./gradlew test can't verify DB/IT behaviour
# locally. Bring a daemon up so the full suite runs. Best-effort: a Docker
# failure must not abort the rest of session setup (Docker is an enhancement,
# not a hard dependency of the session). See scripts/start-dockerd.sh and
# docs/agents/docker-testcontainers.md.
DOCKERD_SCRIPT="$PROJECT_DIR/scripts/start-dockerd.sh"
if [ -x "$DOCKERD_SCRIPT" ]; then
  echo "cloud-session-setup: starting Docker daemon for backend ITs ..." >&2
  "$DOCKERD_SCRIPT" \
    || echo "cloud-session-setup: start-dockerd failed; backend ITs will skip (run 'bash scripts/start-dockerd.sh' to retry)" >&2
fi

exit 0
