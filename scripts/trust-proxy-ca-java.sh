#!/usr/bin/env bash
#
# Make the JDK trust the agent-proxy CA so `./gradlew` works in cloud sessions.
#
# WHY THIS EXISTS
# ---------------
# Outbound HTTPS in Claude Code on the web is re-terminated by a policy proxy, so
# every tool must trust the proxy CA at /root/.ccr/. The environment normally seeds
# a JVM truststore (/root/.ccr/java-truststore.p12) and injects it via
# JAVA_TOOL_OPTIONS — but that seed can FAIL (status: java_truststore_seed_failed),
# and then the JVM falls back to the JDK's default cacerts, which does NOT trust the
# proxy. The Gradle wrapper download (services.gradle.org) and dependency resolution
# (Maven Central) then die with PKIX / "unable to find valid certification path".
#
# Importing the proxy CA straight into the JDK's own cacerts fixes ALL Java TLS in
# one place (wrapper download, deps, any java tool) with no env-var fragility — the
# same "trust the proxy CA at the system level" approach scripts/start-dockerd.sh
# uses for dockerd.
#
# Invoked automatically by the SessionStart hook (scripts/cloud-session-setup.sh) in
# cloud sessions, AND safe to run by hand as the manual fallback:
#
#     bash scripts/trust-proxy-ca-java.sh
#
# Idempotent: if the CA is already in the JDK cacerts it exits 0 without re-importing.
# Best-effort: a non-proxied environment (no CA file) is a no-op, not an error.
set -u

ALIAS="ccr-agent-proxy"
CACERTS_PW="changeit"   # the JDK cacerts default password (not a secret)

log() { echo "trust-proxy-ca-java: $*" >&2; }

# ── 0. Locate the proxy CA. No CA → not a proxied env → nothing to do. ─────
PROXY_CA=""
for c in /root/.ccr/agent-proxy-ca.crt /root/.ccr/ca-bundle.crt; do
  [ -f "$c" ] && { PROXY_CA="$c"; break; }
done
if [ -z "$PROXY_CA" ]; then
  log "no agent-proxy CA found under /root/.ccr — not a proxied session; nothing to do."
  exit 0
fi

# ── 1. Locate the JDK cacerts (prefer the session JDK, then JAVA_HOME). ────
CACERTS=""
for j in /opt/jdk-25 "${JAVA_HOME:-}"; do
  [ -n "$j" ] && [ -f "$j/lib/security/cacerts" ] && { CACERTS="$j/lib/security/cacerts"; break; }
done
if [ -z "$CACERTS" ]; then
  log "no JDK cacerts found (looked in /opt/jdk-25, \$JAVA_HOME) — skipping."
  exit 0
fi

KEYTOOL="$(dirname "$(dirname "$CACERTS")")/../bin/keytool"
[ -x "$KEYTOOL" ] || KEYTOOL="$(command -v keytool || true)"
if [ -z "$KEYTOOL" ] || [ ! -x "$KEYTOOL" ]; then
  log "keytool not found — skipping."
  exit 0
fi

# ── 2. Idempotent: already imported? ──────────────────────────────────────
if "$KEYTOOL" -list -alias "$ALIAS" -keystore "$CACERTS" -storepass "$CACERTS_PW" >/dev/null 2>&1; then
  log "proxy CA already trusted in $CACERTS; nothing to do."
  exit 0
fi

# ── 3. Import. ────────────────────────────────────────────────────────────
if "$KEYTOOL" -importcert -noprompt -alias "$ALIAS" \
     -file "$PROXY_CA" -keystore "$CACERTS" -storepass "$CACERTS_PW" >/dev/null 2>&1; then
  log "imported $PROXY_CA into $CACERTS — ./gradlew TLS through the proxy now works."
else
  log "import failed (./gradlew may hit PKIX errors; see /root/.ccr/README.md)."
fi

exit 0
