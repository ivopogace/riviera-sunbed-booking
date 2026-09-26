---
name: riviera-local-debug
description: >-
  How to build and test riviera-sunbed-booking locally, especially in a Claude Code cloud
  session (the JDK 25 toolchain is hook-provisioned, the full test task OOMs,
  Testcontainers need the hook's dockerd, the clone is shallow). Load BEFORE the session's
  first ./gradlew, gradle, or npm invocation, when a local build/test fails, or BEFORE any
  git history claim (git log / blame / show / merge-base) in a cloud session.
---

# Riviera local debug

## Git in a cloud session

**The clone is shallow** (`git rev-parse --is-shallow-repository` → `true`) and git answers
from the truncated graph without erroring: `git log` (esp. `-S`, `--follow`, ranges) stops
at the graft, `git blame` attributes older lines to the boundary commit, `git show` renders a
boundary-commit modification as a whole-file addition, `git merge-base` returns a wrong base
silently, tags below the graft are absent. Before any history claim:

```bash
if [ "$(git rev-parse --is-shallow-repository)" = true ]; then git fetch --unshallow; fi
```

A history claim made on the shallow graph is not evidence: re-run the trace after deepening
before you report a cause, name an introducing commit, or write one into an issue or PR.

The diff-scoped guards (`--diff`), `check-comment-only.mjs` and `check-review-range.mjs` exit 2
on a shallow clone; `--files`/`--all`/`--hook` runs do not check.

**Remote-tracking refs are frozen** at container start: `origin/main` does not follow `main`.
Fetch what you diff against (`git fetch --no-tags origin <ref>`); for the review gate the
range check in `riviera-sdlc` `references/pr-gates.md` §1 enforces it. The guards fetch their
`<remote>/<branch>` base themselves, so `--diff origin/main` is correct as typed; they refuse a
bare `main`; a commit SHA works offline.

## Backend (`platform/`)

**Cloud session:** the SessionStart hook installs JDK 25 at `/opt/jdk-25`.

```bash
cd platform
export JAVA_HOME=/opt/jdk-25
./gradlew --console=plain compileJava compileTestJava
```

Never change the wrapper's `distributionUrl`. If the wrapper download 403s, use the image's
system Gradle 8.14 with `gradle --no-daemon` (daemon on JDK 21, toolchain on 25) per
`docs/agents/gradle-proxy-trust.md` — also the doc for any TLS/PKIX error. Reachability is
per-session; measure, don't assume.

**Scoped tests only** — never the bare `test` task in a cloud sandbox (several Spring contexts,
OOM exit 137):

```bash
# structural net — after any backend structure change (rule: riviera-modulith § The structural net)
./gradlew --console=plain test \
  --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" \
  --tests "*PackageShapeArchitectureTests*" --tests "*DomainPurityArchitectureTests*" \
  --tests "*PublishedSurfacePlacementArchitectureTests*" \
  --tests "*RetiredSetExclusionArchitectureTests*"

./gradlew --console=plain test --tests "*<ClassName>*"     # the tests your change touched
```

A `dockerd` is normally provided by the hook (`scripts/start-dockerd.sh`;
`docs/agents/docker-testcontainers.md`), so one IT class at a time runs locally; without it
they skip (`@EnabledIfDockerAvailable`). CI owns the full suite. Contributor laptop: `./gradlew
test` is fine.

### Full-suite-only failures

CI runs every test through cached, long-lived contexts in one JVM, so shared-state
infrastructure fails only there. Known: the per-IP login rate limiter (every MockMvc login
shares one client IP) — each test login presents a unique `X-Forwarded-For` via
`SessionLoginSupport.uniqueClientIp()`, which mints `198.18.x.y` because RFC1918/loopback
values are skipped as trusted proxy hops; the ITs never set the `CF-Connecting-IP` header,
which would take over the key — never set both in one test. An unconditional `@Scheduled`
sweep interfering with a race IT's window — fix with a long `initial-delay`. When a change touches
a filter, rate limiter, `@Scheduled` job, cache or shared bean in the web chain, design the
tests to isolate (unique key per test, initial-delay, per-test reset) and check the push's CI
run before building on it.

### Blast radius

`@ApplicationModuleTest` bootstraps its module plus the root package's beans, but another
module's beans only when that module is bootstrapped. Moving a port the root
`SecurityConfig` chain needs out of the root fails every other module's `@ApplicationModuleTest`
with `NoSuchBeanDefinitionException` while web slices stay green (`WebSliceStubs` supplies
it). Fix: the moved port joins each such test's `@MockitoBean` list. After any bean move
between root and a module, run `grep -rl '@ApplicationModuleTest' platform/src/test/java` —
the whole population — and add a stub to `WebSliceStubs` for a new root-edge dependency.

## Frontend (`frontend/`)

Commands: CLAUDE.md §Commands. `npm run build` only when production-build risk is in play. On
Windows use `npm run test:e2e:a11y` (plain `test:e2e` is the real-backend suite).

**Playwright in a cloud session:** never `playwright install`. Chromium is at
`/opt/pw-browsers/chromium`; `playwright.config.ts` falls back to it, `playwright.a11y.config.ts`
needs `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y`. Keep the
pinned 2 workers (the sandbox saturates there); a full run is ~5 min.

## Running the stack

No supported single-command stack in a cloud sandbox; `scripts/e2e-local-stack.sh` (host
Postgres + backend in the container) is the one workaround, container-local only. Deployed
checks: `docs/deploy/`, `docs/runbooks/`.

Not for CI config questions or diagnosing a failure's cause (`diagnosing-bugs`). Related:
`docs/agents/gradle-proxy-trust.md`, `docs/agents/docker-testcontainers.md`,
`docs/agents/cloud-environment.md`.
