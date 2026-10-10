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

## Building locally in a cloud session

**Start with the pinned wrapper — `./gradlew`.** Measured 2026-09-10 in one session whose
GitHub scope is limited to this repo: the wrapper self-provisioned `gradle-9.7.1-bin.zip` and
ran on JDK 25. The download is two hops — `services.gradle.org` 307s to
`github.com/gradle/gradle-distributions/releases/download/…`, which 302s to
`release-assets.githubusercontent.com` — and the proxy served both. That the **`github.com`
hop passes** is the point: the repo-scope gate does not cover release assets, for a repo
outside the session's scope. **No toolchain registration is needed** — `JAVA_HOME=/opt/jdk-25`
already satisfies `languageVersion = 25`, so Gradle runs and compiles on the same JVM:

```bash
cd platform
export JAVA_HOME=/opt/jdk-25
./gradlew --console=plain compileJava compileTestJava \
  test --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*"
# → BUILD SUCCESSFUL; the structural + JDBC-only rules run on JDK 25.
```

**Every reachability fact on this page is per-session, not a platform state.** The proxy's
network allowlist and the session's GitHub scope are configured per environment, and they have
differed *on the same day*: a session about three hours earlier on 2026-09-10 found the Temurin
**and** Corretto JDK downloads both 403ing, where this one reached Corretto without trouble.
So read every row below as "what one session measured", re-measure before relying on it, and
take the fallback the moment the wrapper 403s. Nothing here retired the fallback.

**Do NOT change the wrapper's `distributionUrl`** — CI has full GitHub access and depends
on the pinned version (`platform/gradle/wrapper/gradle-wrapper.properties` is the source
of truth) + JDK 25.

The **JDK** has its own 403, and in that session it was narrower than it looks: the
repo-scope gate covered github.com **pages and API** but not release assets.

| URL | Result |
|---|---|
| `api.github.com/repos/adoptium/temurin25-binaries/releases/latest` | 403 `not enabled for this session` |
| `github.com/adoptium/temurin25-binaries/releases/latest` | 403, same body |
| `github.com/adoptium/…/releases/download/<tag>/<asset>.tar.gz` | **200/206 — serves fine** |
| `api.adoptium.net` | CONNECT refused — genuinely off the network allowlist |

So only step 2's **resolve-latest** call was blocked there; the tarball it would go on to
fetch was reachable. A pinned direct download URL would make the Temurin path work with no
allowlist change (that is exactly what step 6 does for `gh`, and why its version is pinned).
**We deliberately do not do that** — `build.gradle` takes any vendor at `languageVersion = 25`,
so whichever JDK 25 the hook lands is a correct outcome rather than a degraded one, and a pin
is a version to keep current by hand. Step 2 is therefore expected to fall through to step 2b,
and `/opt/jdk-25` was **Amazon Corretto 25** from `corretto.aws` in that session.

**`corretto.aws` is not guaranteed to be reachable.** Step 2b's own failure message says to add
it to the env network allowlist, and the earlier session above hit exactly that — both JDK
downloads 403, no `/opt/jdk-25` at all. `api.adoptium.net` is off the allowlist too (its CONNECT
is refused), so that is the domain to add if you ever want vendor-side Temurin resolution.

### Fallback: the wrapper's distribution download is blocked

Live, not historical — whether it is needed is per-session. The failure it answers is a
**403** (`{"message":"...not enabled for this session..."}`) on the distribution download: the
`services.gradle.org` URL's `github.com` hop is what a repo-scope proxy can refuse, and
sessions differ on whether it does. Then fall back to the image's **pre-installed system
Gradle 8.14.x**. One catch: **Gradle 8.14.x
cannot _run_ on JDK 25** (`Unsupported class file major version 69`), so run its daemon on
**JDK 21** and point the **toolchain** at `/opt/jdk-25`. The app still compiles and tests on
25 — only Gradle itself runs on 21:

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

The backend Testcontainers ITs are `@EnabledIfDockerAvailable`: in a cloud session a
`dockerd` **is normally provided by the SessionStart hook** (see
`docker-testcontainers.md`), so targeted ITs *can* run; without a daemon they skip
cleanly. Either way, keep local runs **scoped** (the bare `test` task can OOM the
sandbox — see `riviera-local-debug`); CI runs the full IT suite on every tree it has not
already built green. `compile*` + the
structural test classes are the minimum meaningful local check.

### Maven Central returns 429

Symptom: `Received status code 429 from server: Too Many Requests` on `repo.maven.apache.org` or
`repo1.maven.org`, in plugin resolution, in `compileTestJava` dependency resolution, or for
`org.jacoco:org.jacoco.agent` on the `test` task. The session behind #1514 saw it persist across
about ten retries over forty minutes. Disabling JaCoCo (`-x jacocoTestReport`, or an init script
setting `jacoco.enabled = false` on every `Test` task) does not help: the `test` task still
resolves the agent configuration.

1. **Confirm it is Central, not the proxy.** `curl -sS "$HTTPS_PROXY/__agentproxy/status"` should
   be healthy; then compare Central with Google's mirror for the failing artifact:

   ```bash
   p=org/jacoco/org.jacoco.agent/0.8.15/org.jacoco.agent-0.8.15.pom   # the artifact in the error
   curl -s -o /dev/null -w '%{http_code} central\n' "https://repo.maven.apache.org/maven2/$p"
   curl -s -o /dev/null -w '%{http_code} mirror\n'  "https://maven-central.storage-download.googleapis.com/maven2/$p"
   ```

   Go on when Gradle keeps getting 429 from Central and the mirror answers 200. Central's 429 can
   be per request (measured 2026-10-10: Gradle got 429 while this `curl` got 200 for another
   artifact), so a lone `200 central` does not rule it out. A proxy 403/407 or a TLS error is the
   sections above, not this.
2. **Pass a session-local init script that lists the mirror first.** Write it to the session's
   scratchpad (never into the repo) and pass it with `-I` on each invocation:

   ```groovy
   // <scratchpad>/central-mirror.gradle
   def mirror = 'https://maven-central.storage-download.googleapis.com/maven2/'
   beforeSettings { settings ->
       settings.pluginManagement.repositories {
           maven { url = mirror }
           gradlePluginPortal()
       }
   }
   allprojects {
       repositories {
           maven { url = mirror }
       }
   }
   ```

   The `beforeSettings` block is needed too (measured 2026-10-10 on the pinned wrapper): the Plugin
   Portal redirects the `plugins {}` block's dependencies (e.g. `commons-parent`) to
   `repo.maven.apache.org`, so a 429 can hit plugin resolution before any project repository is
   consulted. With both blocks, `compileJava compileTestJava` resolved and built through the mirror.

   ```bash
   ./gradlew -I <scratchpad>/central-mirror.gradle --console=plain test --tests "*<ClassName>*"
   ```

What this fallback is, and is not (owner decision, #1514):

- **Local, in a cloud session, only.** Never committed, never used in CI; `build.gradle`'s
  `repositories`, the wrapper and its `distributionUrl` are never edited for it. CI resolves from
  Central as committed.
- **Unsupported and unverified.** The mirror's own index page says it is not an officially
  supported Google product, and this repo commits no Gradle dependency verification
  (`gradle/verification-metadata.xml`), so nothing checks that the mirror's bytes match Central's.
  That is why it stays a last-resort local fallback (`supply-chain-security.md`).
- Drop the `-I` as soon as Central answers again.
