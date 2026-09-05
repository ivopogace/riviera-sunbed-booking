---
name: riviera-local-debug
description: >-
  How to build and test riviera-sunbed-booking locally, especially in a Claude Code cloud
  session (the Gradle wrapper cannot self-provision, the full test task OOMs,
  Testcontainers need the hook's dockerd, the clone is shallow). Load BEFORE the session's
  first ./gradlew, gradle, or npm invocation, when a local build/test fails, or BEFORE any
  git history claim (git log / blame / show / merge-base) in a cloud session.
---

# Riviera local debug — build & test recipes

## Git in a cloud session — the clone is shallow, and it is never refetched

Two properties of a cloud session's repository, both silent (issue #942):

**It is shallow.** `git rev-parse --is-shallow-repository` returns `true`. Git answers from
the truncated graph rather than erroring, so these are all unreliable until you deepen it:

| Command | What it does wrong on a shallow clone |
|---|---|
| `git log` (esp. `-S`, `--follow`, `<range>`) | history stops at the graft; "the commit that introduced this" is whatever is nearest the boundary |
| `git blame` | every line older than the graft is attributed to the boundary commit |
| `git show <sha> -- <path>` | on the boundary commit a *modified* file renders as a whole-file addition |
| `git merge-base` | it answers from the truncated graph — a **wrong base, no error, no warning** — or it fails outright. Neither is safe, which is why `git-diff.mjs`'s `resolveBase()` refuses on a shallow clone rather than resolving at all (#952) |
| `git describe`, `git tag --merged` | tags below the graft were never fetched |

The remedy is one command, and it is a precondition, not a cleanup:

```bash
if [ "$(git rev-parse --is-shallow-repository)" = true ]; then git fetch --unshallow; fi
```

**A history claim made without it is not evidence.** Re-run the trace after deepening before
you report a cause, name an introducing commit, or write one into an issue or PR.

**The `scripts/check-*.mjs` guards enforce this rather than warn about it.** Every one that
resolves a diff range exits 2 on a shallow clone, naming the command above — so in a fresh
session the unshallow comes before the first `--diff` run, not after a confusing report (#952).

**Remote-tracking refs are frozen too.** The clone is made once at container start and never
refetched, so `origin/main` is whatever `main` was then — it does not follow the branch.
Anything diffed against it silently widens as `main` moves. Fetch the branch you intend to
diff (`git fetch --no-tags origin <ref>`) rather than trusting the ref; for the review gate
specifically that is not optional, and the scope check that enforces it is `riviera-sdlc`
`references/pr-gates.md` §1 step 2.

The `check-*.mjs` guards no longer need that fetch spelled ahead of them: since #952 each one
fetches its `<remote>/<branch>` base itself and refuses when it cannot, so a documented
`--diff origin/main` is correct as typed. The two forms they accept are that one and a commit
SHA — a bare `main` is refused, because a local branch in a session-old clone is a snapshot
exactly as a tracking ref is. Reach for the SHA form when there is no network.

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
# the structural net — run after any backend structure change; membership rule + members: CLAUDE.md §Commands
gradle --no-daemon --console=plain test \
  --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" \
  --tests "*PackageShapeArchitectureTests*" --tests "*DomainPurityArchitectureTests*" \
  --tests "*PublishedSurfacePlacementArchitectureTests*"

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

### The other way scoped runs mislead: blast radius

The class above is about *state*; this one is about *wiring*, and it needs no full suite to
bite — only a test you did not think to name. Moving a bean changes which contexts can still be
built, and that set is not the set of tests whose subject you touched.

- **A bean the root edge depends on moved into a module.** `@ApplicationModuleTest` bootstraps
  its own module plus the **root package's** beans — but a module's beans only when that module
  is bootstrapped. Moving the proof-of-work port out of the root left `SecurityConfig`'s filter
  chain asking for a bean `payout` isolation does not supply, so `PayoutModuleTest` failed with
  `NoSuchBeanDefinitionException` while every challenge test and every web slice stayed green
  (`WebSliceStubs` supplies the port). Fix: the moved port joins that test's `@MockitoBean`
  list, exactly as the `shared` kernel's two principal accessors already do — that file's own
  comments explain the pattern, one module earlier.

**The rule:** when a change moves a bean between the root package and a module, or gives the root
edge a new module dependency, run the module tests before pushing. `grep -rl
'@ApplicationModuleTest' platform/src/test/java` is the entire population and it is small; a
`@WebMvcTest` is only safe because `WebSliceStubs` supplies the port, so a new root-edge
dependency means a new stub bean there too.

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

Leave the pinned 2 workers alone — the sandbox saturates at two Chromiums and more only slows
the run (measurements in the config header). A full run takes ~5 min.

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
