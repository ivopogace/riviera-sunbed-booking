#!/usr/bin/env bash
#
# Start the Docker daemon for backend Testcontainers integration tests.
#
# WHY THIS EXISTS
# ---------------
# The backend ITs use Testcontainers (Postgres 17) and are gated by
# @EnabledIfDockerAvailable, so they *skip* cleanly when no daemon is running —
# which is the default in Claude Code on the web. This brings a daemon up so
# `./gradlew test` runs the full backend suite instead of skipping the ITs.
#
# It is invoked automatically by the SessionStart hook (scripts/cloud-session-setup.sh)
# in cloud sessions, AND is safe to run by hand as the manual fallback:
#
#     bash scripts/start-dockerd.sh
#
# Idempotent: if a daemon is already reachable it exits 0 without starting another.
#
# GOTCHAS (learned the hard way — see docs/agents/docker-testcontainers.md)
# ------------------------------------------------------------------------
#   * Storage driver: the sandbox cannot use overlay2; use --storage-driver=vfs.
#   * Registry through the proxy: dockerd needs HTTP(S)_PROXY in its environment
#     and must trust the agent-proxy CA, or `docker pull` fails TLS (x509).
#   * Lifecycle: NEVER `pkill -f dockerd` — the pattern matches this script's own
#     command line and -9 would kill the session. Stop it by pidfile:
#     kill "$(cat /var/run/docker.pid)".
set -u

DOCKER_SOCK="/var/run/docker.sock"
DOCKER_PID="/var/run/docker.pid"
DOCKER_LOG="/var/log/dockerd.log"
PROXY_CA_SRC="/root/.ccr/ca-bundle.crt"
PROXY_CA_DEST="/usr/local/share/ca-certificates/ccr-proxy.crt"
READY_TIMEOUT_SECS=30

log() { echo "start-dockerd: $*" >&2; }

# ── 0. Idempotent guard: already up? ──────────────────────────────────────
if docker info >/dev/null 2>&1; then
  log "Docker daemon already reachable; nothing to do."
  exit 0
fi

# dockerd needs root (for the daemon, the CA copy, update-ca-certificates).
if [ "$(id -u)" != "0" ]; then
  log "ERROR — must run as root to start dockerd (uid=$(id -u))."
  exit 1
fi

if ! command -v dockerd >/dev/null 2>&1; then
  log "ERROR — dockerd not found on PATH; cannot start Docker."
  exit 1
fi

# ── 1. Trust the agent-proxy CA so registry TLS verifies ──────────────────
# The proxy terminates TLS, so dockerd must trust its CA to pull images. Copy
# the bundle into the system trust store and refresh it (idempotent: only when
# absent or changed).
if [ -f "$PROXY_CA_SRC" ]; then
  if [ ! -f "$PROXY_CA_DEST" ] || ! cmp -s "$PROXY_CA_SRC" "$PROXY_CA_DEST"; then
    log "Trusting agent-proxy CA ($PROXY_CA_DEST) ..."
    cp "$PROXY_CA_SRC" "$PROXY_CA_DEST"
    update-ca-certificates >/dev/null 2>&1 \
      || log "WARN — update-ca-certificates failed; registry pulls may fail TLS."
  fi
else
  log "WARN — proxy CA bundle not found at $PROXY_CA_SRC; registry pulls may fail TLS."
fi

# ── 2. Proxy environment for the daemon (registry egress) ─────────────────
# dockerd reads HTTP(S)_PROXY/NO_PROXY from its own environment for image pulls.
# The agent proxy is exposed as $HTTPS_PROXY; reuse it for both schemes.
PROXY_URL="${HTTPS_PROXY:-${https_proxy:-}}"
NO_PROXY_VAL="${NO_PROXY:-${no_proxy:-localhost,127.0.0.1,::1,host.docker.internal}}"

PROXY_ENV=()
if [ -n "$PROXY_URL" ]; then
  PROXY_ENV+=("HTTP_PROXY=$PROXY_URL" "HTTPS_PROXY=$PROXY_URL")
  PROXY_ENV+=("http_proxy=$PROXY_URL" "https_proxy=$PROXY_URL")
  PROXY_ENV+=("NO_PROXY=$NO_PROXY_VAL" "no_proxy=$NO_PROXY_VAL")
  log "Daemon will pull through proxy $PROXY_URL (NO_PROXY=$NO_PROXY_VAL)."
else
  log "WARN — no HTTPS_PROXY in environment; registry pulls may be blocked."
fi

# ── 3. Launch the daemon, fully detached ──────────────────────────────────
# setsid + redirected stdio reparents dockerd to init so it OUTLIVES this script
# (and the SessionStart hook process), staying up for the whole session. vfs is
# the only storage driver that works in the sandbox (no overlay/privileged).
log "Starting dockerd (vfs) ; logs → $DOCKER_LOG"
setsid env "${PROXY_ENV[@]}" dockerd \
  --storage-driver=vfs \
  --host="unix://$DOCKER_SOCK" \
  --pidfile="$DOCKER_PID" \
  >>"$DOCKER_LOG" 2>&1 < /dev/null &
disown 2>/dev/null || true

# ── 4. Wait for readiness ─────────────────────────────────────────────────
log "Waiting up to ${READY_TIMEOUT_SECS}s for the Docker socket ..."
for _ in $(seq 1 "$READY_TIMEOUT_SECS"); do
  if docker info >/dev/null 2>&1; then
    log "Docker daemon is ready ($(docker version --format '{{.Server.Version}}' 2>/dev/null))."
    exit 0
  fi
  sleep 1
done

log "ERROR — Docker daemon did not become ready in ${READY_TIMEOUT_SECS}s."
log "Last lines of $DOCKER_LOG:"
tail -n 20 "$DOCKER_LOG" >&2 2>/dev/null || true
exit 1
