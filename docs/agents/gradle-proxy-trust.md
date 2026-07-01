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

## Building locally on a repo-scoped session (Gradle wrapper unreachable)

On a session whose **GitHub scope is limited to this repo**, the pinned Gradle wrapper
**cannot self-provision**: `services.gradle.org/distributions/gradle-9.6.1-bin.zip`
**307-redirects to the `gradle/gradle-distributions` GitHub repo**, which the repo-scope
proxy blocks with `403 {"message":"...not enabled for this session..."}`. Likewise the
setup hook's Temurin JDK (from `adoptium/temurin25-binaries`) 403s — which is why
`scripts/cloud-session-setup.sh` step 2b falls back to **Amazon Corretto 25** from
`corretto.aws` (network-allowlisted, not GitHub-gated), landing a JDK at `/opt/jdk-25`.

**Do NOT change the wrapper's `distributionUrl`** — CI has full GitHub access and depends
on the pinned 9.6.1 + JDK 25. Local builds use the **pre-installed system Gradle 8.14.x**
instead. One catch: **Gradle 8.14.x cannot _run_ on JDK 25** (`Unsupported class file major
version 69`). So run its daemon on **JDK 21** and point the **toolchain** at `/opt/jdk-25`:

```bash
# one-time: register the JDK 25 toolchain for Gradle (user-level, uncommitted)
mkdir -p ~/.gradle
printf 'org.gradle.java.installations.paths=/opt/jdk-25\norg.gradle.java.installations.auto-download=false\n' \
  >> ~/.gradle/gradle.properties

cd platform
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64   # daemon on 21; project compiles/tests on 25
gradle --no-daemon --console=plain compileJava compileTestJava \
  test --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*"
# → BUILD SUCCESSFUL; the structural + JDBC-only rules run on JDK 25.
```

The backend Testcontainers ITs are `@EnabledIfDockerAvailable` and **skip** locally
(`dockerd` won't start here — see `docker-testcontainers.md`); CI runs the full IT suite.
`compile*` + the structural test classes are the meaningful local check.
