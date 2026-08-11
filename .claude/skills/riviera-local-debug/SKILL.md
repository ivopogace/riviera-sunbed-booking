---
name: riviera-local-debug
description: How to build, test, and run riviera-sunbed-booking locally — especially in a Claude Code cloud session, where the Gradle wrapper cannot self-provision, the full backend test task can OOM-kill the container, and Testcontainers ITs need the hook-provided dockerd (they skip cleanly without one). Load BEFORE the first ./gradlew, gradle, or npm invocation of a session, or when diagnosing a local build/test failure. It encodes the scoped-test discipline (smallest set that proves the change; CI owns the full suite) and points at the deeper runbooks (gradle-proxy-trust, docker-testcontainers).
---

# Riviera local debug — build & test recipes

**Announce at start:** "Loaded riviera-local-debug — using the session-appropriate
build/test recipe."

## Why this skill exists

Two lessons were paid for the hard way in cloud sessions and belong pre-made:

1. **`./gradlew` dies on first use** in a repo-scoped cloud session (the proxy 403s the
   pinned wrapper distribution), and nothing else routes you to the fix before you hit it.
2. **`gradle test` (the full task) can OOM-kill the container** (exit 137) — it boots
   several Spring contexts. The suite is CI's job, not the sandbox's.

## Backend (Spring Boot, `platform/`)

### Cloud session (Claude Code on the web — the common case)

The pinned Gradle wrapper **cannot self-provision** (repo-scoped proxy blocks the
distribution download) and Gradle 8.14 cannot *run* on JDK 25. Recipe — details and
rationale in `docs/agents/gradle-proxy-trust.md` (read it on any TLS/PKIX or 403 error):

```bash
# one-time per environment: register the JDK 25 toolchain (user-level, uncommitted)
mkdir -p ~/.gradle
printf 'org.gradle.java.installations.paths=/opt/jdk-25\norg.gradle.java.installations.auto-download=false\n' \
  >> ~/.gradle/gradle.properties

cd platform
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64   # daemon on 21; code compiles/tests on 25
gradle --no-daemon --console=plain compileJava compileTestJava
```

**Do NOT change the wrapper's `distributionUrl`** — CI depends on the pinned version.

### Scoped tests — the discipline (any environment)

Run the **smallest set that proves the change**; never the bare `test` task in a cloud
sandbox (OOM risk — and broad IT sweeps are slow on the vfs storage driver):

```bash
# the structural net (fast, context-free — run after any backend structure change)
gradle --no-daemon --console=plain test \
  --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" \
  --tests "*PackageShapeArchitectureTests*"

# plus the unit/slice tests your change touched
gradle --no-daemon --console=plain test --tests "*<ClassName>*"
```

- **CI owns the full suite.** In a cloud session a `dockerd` is normally provided by the
  SessionStart hook (`scripts/start-dockerd.sh`; see
  `docs/agents/docker-testcontainers.md`), so a **targeted** IT class can run locally —
  but run ITs scoped, one class at a time (vfs storage driver + container memory make
  broad IT runs slow and OOM-prone). Without a daemon they skip cleanly
  (`@EnabledIfDockerAvailable`). "Green locally" on scoped classes + "green CI" on the PR
  is the complete verification, and the plan doc's AC table should say which half proves
  what.

### The full-suite-only failure class (known blind spot of scoped runs)

Scoped batches share almost nothing; CI's full suite runs every test through **cached,
long-lived Spring contexts in one JVM**. So there is a failure class that scoped runs
**cannot** show: **cross-cutting stateful infrastructure accumulating state across tests**.
It has bitten twice in one day:

- **#127:** a new per-IP login rate limiter passed every scoped batch, then failed the full
  suite with 19×429 — every MockMvc login in the JVM shared the one default client IP and
  blew the 10/min budget mid-run. Fix: each test login presents a unique `X-Forwarded-For`
  (`SessionLoginSupport.uniqueClientIp()`). **Since #129 that address must also be
  _untrusted_** — the resolver now skips hops inside `riviera.ratelimit.trusted-proxies`
  (loopback + RFC1918 + link-local), so a "unique" `10.x`/`192.168.x` value is read as a proxy
  hop, falls through to the loopback MockMvc peer, and silently recreates the #127 lockout.
  The helper mints `198.18.x.y` (RFC 2544) for exactly this reason. **Since #286 the resolver
  also prefers an edge-supplied client-IP header** (`riviera.ratelimit.client-ip-header`,
  shipped `CF-Connecting-IP`) ahead of the `X-Forwarded-For` walk — the ITs deliberately do
  **not** set it, so they keep taking the walk and this isolation rule is unchanged. A test
  that *does* set that header takes over the key outright; don't mix the two in one test.
- **#98/#122:** an unconditional `@EnableScheduling` background sweep interfered with a
  race IT's timing window. Fix: a long `initial-delay` pushes the sweep out of test windows.

**The rule:** when a change adds or touches a **filter, rate limiter, `@Scheduled` job,
cache, or any shared-state bean in the security/web chain**, ask *"what does the full
suite's cumulative traffic do to this?"* before pushing — and design the tests to isolate
(unique keying dimension per test, initial-delay for background jobs, per-test state
reset). Expect the answer to be verified **only by the push's CI run** — check it before
building the next phase on top (the riviera-sdlc CI-gate rule).

### Local machine (contributor laptop)

`./gradlew` works normally (wrapper self-provisions). Same scoped-test discipline applies
out of courtesy to your battery; `./gradlew test` for the full suite is fine.

## Frontend (Angular, `frontend/`)

```bash
cd frontend
npm run lint
npm run format:check   # Prettier over src + e2e (clean since #631); `npm run format` to apply
npm test          # Vitest via @angular/build:unit-test — runs once in jsdom; NOT Karma
npm run build     # only when production-build risk is in play
```

E2e: the CI-safe mocked suite lives in `frontend/e2e/`; the local-only real-backend suite
in `frontend/e2e/real-backend/` (placement rules: `riviera-review-overlay` RV-FE-E2E;
authoring: `playwright-cli`). On Windows (the primary dev machine) run the mocked suite
via `npm run test:e2e:a11y`; plain `npm run test:e2e` is the local real-backend suite.

## Running the stack

There is no supported single-command local stack in a cloud sandbox (DB via Testcontainers
is CI/local-Docker territory). For deployed-environment checks see `docs/deploy/` and the
runbooks in `docs/runbooks/`.

## When NOT to use

- CI configuration questions (that's `ci.yml` + issue #3 history, not this skill).
- Diagnosing a *test failure's cause* — that's `diagnosing-bugs`; this skill only gets the
  tests *running* in the right scope.

## Integration

- `riviera-sdlc` — routes here at the first local build/test invocation of a session.
- `docs/agents/gradle-proxy-trust.md` — proxy CA / wrapper-403 details (authoritative).
- `docs/agents/docker-testcontainers.md` — how the session's dockerd is provided (and stopped safely).
- `riviera-plan-doc` — the plan's per-phase test-scope rule defers to this skill's recipes.
