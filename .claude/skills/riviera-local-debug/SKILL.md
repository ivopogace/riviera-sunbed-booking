---
name: riviera-local-debug
description: How to build, test, and run riviera-sunbed-booking locally — especially in a Claude Code cloud session, where the Gradle wrapper cannot self-provision, the full backend test task can OOM-kill the container, and Testcontainers ITs need the hook-provided dockerd (they skip cleanly without one). Load BEFORE the first ./gradlew, gradle, or npm invocation of a session, or when diagnosing a local build/test failure. It encodes the scoped-test discipline (smallest set that proves the change; CI owns the full suite).
---

# Riviera local debug — build & test recipes

## Backend (Spring Boot, `platform/`)

### Cloud session (Claude Code on the web)

The pinned Gradle wrapper cannot self-provision (the repo-scoped proxy blocks the
distribution download) and the image's system Gradle 8.14 cannot run on JDK 25. Recipe
(details in `docs/agents/gradle-proxy-trust.md` — read it on any TLS/PKIX or 403 error):

```bash
# one-time per environment: register the JDK 25 toolchain (user-level, uncommitted)
mkdir -p ~/.gradle
printf 'org.gradle.java.installations.paths=/opt/jdk-25\norg.gradle.java.installations.auto-download=false\n' \
  >> ~/.gradle/gradle.properties

cd platform
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64   # daemon on 21; code compiles/tests on 25
gradle --no-daemon --console=plain compileJava compileTestJava
```

Do NOT change the wrapper's `distributionUrl` — CI depends on the pinned version.

### Scoped tests (any environment)

Run the smallest set that proves the change; never the bare `test` task in a cloud sandbox
(it boots several Spring contexts and can OOM-kill the container, exit 137; broad IT sweeps
are slow on the vfs storage driver):

```bash
# the structural net (fast, context-free — run after any backend structure change)
gradle --no-daemon --console=plain test \
  --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" \
  --tests "*PackageShapeArchitectureTests*"

# plus the unit/slice tests your change touched
gradle --no-daemon --console=plain test --tests "*<ClassName>*"
```

CI owns the full suite. In a cloud session a `dockerd` is normally provided by the
SessionStart hook (`scripts/start-dockerd.sh`; `docs/agents/docker-testcontainers.md`), so
a targeted IT class can run locally — one class at a time. Without a daemon they skip
cleanly (`@EnabledIfDockerAvailable`). "Green locally" on scoped classes + "green CI" on
the PR is the complete verification; the plan doc's AC table says which half proves what.

### The full-suite-only failure class

Scoped batches share almost nothing; CI's full suite runs every test through cached,
long-lived Spring contexts in one JVM. So cross-cutting stateful infrastructure
accumulating state across tests fails only in the full suite. Known instances:

- A per-IP login rate limiter: every MockMvc login in the JVM shares one default client IP
  and blows the login budget mid-run. So each test login presents a unique
  `X-Forwarded-For` (`SessionLoginSupport.uniqueClientIp()`). That address must also be
  untrusted — the resolver skips hops inside `riviera.ratelimit.trusted-proxies` (loopback
  + RFC1918 + link-local), so a `10.x`/`192.168.x` value is read as a proxy hop and falls
  through to the loopback peer; the helper mints `198.18.x.y` (RFC 2544) for this reason.
  The resolver also prefers an edge-supplied client-IP header
  (`riviera.ratelimit.client-ip-header`, shipped `CF-Connecting-IP`) ahead of the
  `X-Forwarded-For` walk — the ITs deliberately do not set it. A test that does set that
  header takes over the key outright; don't mix the two in one test.
- An unconditional `@EnableScheduling` background sweep interfered with a race IT's timing
  window. Fix: a long `initial-delay` pushes the sweep out of test windows.

**The rule:** when a change adds or touches a filter, rate limiter, `@Scheduled` job,
cache, or any shared-state bean in the security/web chain, ask what the full suite's
cumulative traffic does to it before pushing, and design the tests to isolate (unique
keying dimension per test, initial-delay for background jobs, per-test state reset). The
answer is verified only by the push's CI run — check it before building the next phase on top.

### Local machine (contributor laptop)

`./gradlew` works normally. Same scoped-test discipline; `./gradlew test` for the full suite is fine.

## Frontend (Angular, `frontend/`)

The command set is CLAUDE.md §Commands (Vitest in jsdom, not Karma). Run `npm run build`
only when production-build risk is in play. On Windows run the mocked e2e suite via
`npm run test:e2e:a11y` — plain `npm run test:e2e` is the local real-backend suite (suite
placement: `riviera-review-overlay` RV-FE-E2E; authoring: `playwright-cli`).

**Playwright in a cloud session:** never run `playwright install` — Chromium is
pre-installed at `/opt/pw-browsers/chromium` (a stable symlink), and the pinned
`@playwright/test` often wants a newer revision than the image ships, so a bare run can
fail with "Executable doesn't exist". The real-backend config (`playwright.config.ts`)
auto-falls-back to that path when `PW_CHROMIUM_EXECUTABLE` is unset; the mocked config
(`playwright.a11y.config.ts`) honours only the env var — run it as
`PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y`.

## Running the stack

There is no supported single-command local stack in a cloud sandbox. The one workaround is
`scripts/e2e-local-stack.sh` — host Postgres + the backend inside the constrained container
so the real-backend suite can run — which its own header marks container-local-only. For
deployed-environment checks see `docs/deploy/` and `docs/runbooks/`.

## When NOT to use

- CI configuration questions (`ci.yml`).
- Diagnosing a test failure's cause (`diagnosing-bugs`); this skill only gets the tests
  running in the right scope.

## Related docs

- `docs/agents/gradle-proxy-trust.md` — proxy CA / wrapper-403 details.
- `docs/agents/docker-testcontainers.md` — how the session's dockerd is provided (and stopped safely).
- `docs/agents/cloud-environment.md` — what provisions a cloud session (the out-of-repo
  setup script vs the `SessionStart` hook) and the Node-pin bump procedure.
