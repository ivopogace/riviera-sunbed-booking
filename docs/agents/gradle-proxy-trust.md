# Gradle / JDK TLS through the agent proxy (cloud sessions)

In Claude Code on the web, outbound HTTPS is re-terminated by a policy proxy, so the
JVM must trust the proxy CA at `/root/.ccr/`. The environment normally seeds a JVM
truststore and injects it via `JAVA_TOOL_OPTIONS` — but that seed can **fail**
(`curl -sS "$HTTPS_PROXY/__agentproxy/status"` shows `java_truststore_seed_failed`).
When it does, the JDK falls back to its default `cacerts`, which does **not** trust the
proxy, and `./gradlew` dies downloading the wrapper distribution or resolving
dependencies:

```
javax.net.ssl.SSLHandshakeException: PKIX path building failed:
  unable to find valid certification path to requested target
```

## Fix (automatic)

`scripts/trust-proxy-ca-java.sh` imports the proxy CA straight into the JDK's own
`cacerts` (`/opt/jdk-25/lib/security/cacerts`). That fixes **all** Java TLS in one
place — the wrapper download, dependency resolution, and any other `java` tool — with
no env-var fragility. It is idempotent and best-effort, and the SessionStart hook
(`scripts/cloud-session-setup.sh`, step 3) runs it after the JDK is installed.

## Manual fallback

If `./gradlew` still hits PKIX errors (e.g. a fresh JDK was installed mid-session):

```bash
bash scripts/trust-proxy-ca-java.sh
```

This is the JVM analogue of how `scripts/start-dockerd.sh` trusts the same CA for
`dockerd`. Never disable TLS verification or unset `HTTPS_PROXY` (see
`/root/.ccr/README.md`).
