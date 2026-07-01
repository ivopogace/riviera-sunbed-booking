# Start dockerd in web-session setup (Testcontainers ITs) — Implementation Plan

> DevOps slice. The riviera domain sections (Availability, Modulith, Payment) are
> `N/A` — this changes only the cloud-session toolchain provisioning, no app code.

**Goal:** In a fresh Claude-Code-on-the-web session, after setup runs, `docker info`
succeeds with no manual steps, and `./gradlew test` **executes** (skipped=0) the
Testcontainers venue ITs against a real Postgres 17 instead of skipping them.

**Architecture:** A dedicated, idempotent `scripts/start-dockerd.sh` brings the
daemon up (vfs storage driver, proxy CA trusted, `HTTP(S)_PROXY`/`NO_PROXY` in the
daemon env, readiness wait on the socket); the existing cloud-only SessionStart
hook `scripts/cloud-session-setup.sh` calls it as a third step. The standalone
script doubles as the documented manual-fallback one-liner.

**Persistence:** N/A — no DB schema or migration touched. (The ITs talk to a
Testcontainers-managed Postgres 17; nothing in `db/migration` changes.)

**Source of intent:** GitHub issue **#39**.

**Skills consulted:** `session-start-hook` (SessionStart hook contract — `$CLAUDE_CODE_REMOTE`
cloud gate, `$CLAUDE_PROJECT_DIR`, sync-vs-async, idempotency; led to extending the
existing hook rather than a new registration) · `riviera-plan-doc` (this doc) ·
`riviera-review-overlay` (review gate, esp. RV-PROC-1 + no-secrets). `postgres` /
`codebase-design` / `angular-developer` / `riviera-stripe-payments` **N/A** — no DB,
backend module, frontend, or money code in scope.

**Branch:** `claude/issue-39-dockerd-setup-6dudqe` (exists).

---

## Acceptance criteria (testable)

> DevOps slice — ACs are verified by running commands in a web session, not JUnit
> classes. Each names the exact command and observable outcome.

- [ ] **AC-1:** Given a fresh web session where the SessionStart hook has run, when I
  run `docker info`, then it exits 0 and reports a running daemon with **no manual
  steps**. *Verified by:* `docker info` exit 0 after `cloud-session-setup.sh`.
- [ ] **AC-2:** Given the daemon is up, when I run
  `./gradlew cleanTest test --tests "ai.riviera.platform.venue.*"`, then the venue
  Testcontainers ITs **execute** (skipped=0) and pass against a real Postgres 17.
  *Verified by:* Gradle test report — `VenueReadControllerIT` 4 run / 0 skipped,
  `VenueSeedMigrationIT` 2 run / 0 skipped.
- [ ] **AC-3:** Given a registry pull is needed, when Testcontainers pulls
  `postgres:17`, then the pull succeeds through the agent proxy with TLS verified
  (no `x509`/`certificate` error). *Verified by:* `docker pull postgres:17` exit 0.
- [ ] **AC-4:** Given a non-cloud (local) machine, when `cloud-session-setup.sh` runs,
  then the dockerd step is **skipped** (cloud-gated, `CLAUDE_CODE_REMOTE != true`)
  and no daemon is started. *Verified by:* running the hook with the var unset → no
  `dockerd` process, exit 0.
- [ ] **AC-5:** `@EnabledIfDockerAvailable` and `DockerAvailableCondition` are
  byte-for-byte unchanged. *Verified by:* `git diff` shows no change under
  `platform/src/test/java/ai/riviera/platform/`.
- [ ] **AC-6:** A doc note explains how Docker is provided and the manual one-liner.
  *Verified by:* `docs/agents/docker-testcontainers.md` exists and names
  `bash scripts/start-dockerd.sh`.
- [ ] **AC-7:** No secrets committed; the script reads the proxy/CA from the
  environment + `/root/.ccr/`, never hard-codes them. CI stays green.
  *Verified by:* `git diff` review + green pipeline.

## Non-goals

- **Not** removing or weakening `@EnabledIfDockerAvailable` / `DockerAvailableCondition`
  — the graceful-skip design is correct and stays (AC-5).
- **Not** changing CI: GitHub Actions already provides Docker; CI behaviour is
  untouched. This is purely the web/local session path.
- **Not** pre-pulling `postgres:17` at session start — keeps startup lean;
  Testcontainers pulls on first IT run via the proxy-configured daemon.
- **Not** managing the network egress policy (Docker Hub allow-list) — already added
  by the maintainer; we only consume it.
- **Not** running rootless/overlay Docker — `vfs` + root is what the sandbox supports.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Backgrounded daemon dies when the hook process exits → `docker info` fails in later tool calls | med | high | Launch fully detached with `setsid`/`nohup`, stdio → logfile, so it reparents to init and outlives the hook; readiness-wait before the hook returns | devops | open |
| R-2 | `pkill -f dockerd` self-matches the launching shell and `-9` kills the session | low | high | Never use `pkill -f`; document + use `kill "$(cat /var/run/docker.pid)"` only; script does not kill at all on the happy path | devops | open |
| R-3 | Registry pull fails TLS (`x509`) because the daemon doesn't trust the proxy CA | med | high | `cp /root/.ccr/ca-bundle.crt → /usr/local/share/ca-certificates/ccr-proxy.crt && update-ca-certificates` before start; daemon inherits system trust | devops | open |
| R-4 | Registry pull blocked because daemon has no proxy in its env | med | high | Export `HTTP_PROXY`/`HTTPS_PROXY=$HTTPS_PROXY` + `NO_PROXY` into the daemon's environment at launch | devops | open |
| R-5 | Hook re-run starts a second daemon / errors on an already-running one | med | med | Idempotent guard: if `docker info` already succeeds, skip start; pidfile/socket checks | devops | open |
| R-6 | Synchronous hook adds startup latency (daemon start + readiness wait) | low | low | Keep it lean (no image pre-pull); bounded readiness timeout (~30s) with a clear log on timeout; stays sync per session-start-hook default | devops | open |
| R-7 | A committed secret slips in via the proxy URL / token | low | high | Read everything from env at runtime; commit no values; review `git diff` (AC-7) | devops | open |

## Open questions / Assumptions

- **Assumption:** The SessionStart hook runs as **root** in the cloud image (confirmed
  `id` → uid=0 this session), so `dockerd`, the CA copy, and `update-ca-certificates`
  succeed. — *Owner:* devops · *Resolves by:* validation step (run the hook).
- **Assumption:** `$HTTPS_PROXY` (`http://127.0.0.1:42289`) is reachable from the host
  netns where `dockerd` runs (it is — daemon runs on host loopback, not in a
  container). — *Owner:* devops · *Resolves by:* `docker pull postgres:17` (AC-3).

## Availability & concurrency (invariant #2)

N/A — does not touch `booking`, `availability`, or the beach map. No `availability`
write path, constraint, or reservation logic is in scope.

## Spring Modulith — modules, interfaces, events

N/A — no backend application/domain code. Only test-infra **availability** (the
literal Docker daemon) and shell scripts change; no module, `api/` port, or event.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no money moves.

## Angular — frontend surfaces touched

N/A — backend/devops-only.

## FE↔BE contract

N/A — no API shape changes.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `start-dockerd.sh` + hook wiring | ✅ | (this commit) |
| 1 — Doc note | ✅ | (this commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Validation (this session, against real Postgres 17):**
- AC-1 ✅ `docker info` exit 0 after `start-dockerd.sh` (no manual steps).
- AC-2 ✅ `./gradlew cleanTest test --tests "ai.riviera.platform.venue.*"` → BUILD
  SUCCESSFUL; `VenueReadControllerIT` 4 run/0 skipped, `VenueSeedMigrationIT` 2
  run/0 skipped, 0 failures.
- AC-3 ✅ `docker pull postgres:17` exit 0 through the proxy (TLS verified).
- AC-4 ✅ hook with `CLAUDE_CODE_REMOTE` unset → dockerd step skipped, exit 0.
- AC-5 ✅ `git status platform/src/test` clean — condition classes unchanged.
- AC-6 ✅ `docs/agents/docker-testcontainers.md` present with the manual one-liner.
- AC-7 ✅ no secrets in the diff (all proxy/CA values read from env at runtime).

**SDLC Review gate (riviera-review-overlay + /code-review on PR #40):**
- RV-BE-1 (availability), RV-CT-3/RV-BE-7 (payment), all RV-BE-*/RV-FE-* — **N/A**:
  no app/DB/module/FE/money code in the diff (scripts + docs only).
- RV-PROC-1 (Skill-routing honored) — ✅: diff touches only the devops/session-setup
  area; *Skills consulted* lists `session-start-hook` + `riviera-plan-doc` +
  `riviera-review-overlay`, which covers it.
- Finding (Minor, fixed): stale `/var/run/docker.pid` from a SIGKILLed daemon could
  make a later start refuse, since the idempotency guard only checks `docker info`.
  Fixed by `rm -f "$DOCKER_PID"` immediately before launch (safe — only reached when
  the daemon is unreachable). Commit in this branch.
- Refuted: empty-array `"${PROXY_ENV[@]}"` under `set -u` — bash 5.2 expands it
  without error, and the no-proxy branch never triggers in the cloud env.

---

## File structure

- `scripts/start-dockerd.sh` — **new.** Idempotent dockerd bring-up: trust proxy CA,
  launch detached `dockerd --storage-driver=vfs --host=unix:///var/run/docker.sock`
  with `HTTP(S)_PROXY`/`NO_PROXY` in its env, wait for `/var/run/docker.sock`. Safe
  to run by hand as the manual fallback. No-ops if `docker info` already works.
- `scripts/cloud-session-setup.sh` — **modify.** Add step 3: cloud-only call to
  `start-dockerd.sh` (after JDK setup). Best-effort (a Docker failure must not abort
  the rest of the hook).
- `docs/agents/docker-testcontainers.md` — **new.** How Docker is provided in web
  sessions, the manual one-liner, the `vfs`/proxy/CA gotchas, and the
  **do-not-`pkill -f dockerd`** / kill-by-pidfile lifecycle note.

---

## Phase 0 — `start-dockerd.sh` + hook wiring

**Files:** Create `scripts/start-dockerd.sh` · Modify `scripts/cloud-session-setup.sh`

- [ ] **Step 1: Write `scripts/start-dockerd.sh`** — idempotent, cloud-safe:
  1. If `docker info` already succeeds → log + exit 0 (idempotent guard, R-5).
  2. Trust proxy CA (R-3): if `/root/.ccr/ca-bundle.crt` exists and the dest cert is
     absent/stale, `cp` → `/usr/local/share/ca-certificates/ccr-proxy.crt` +
     `update-ca-certificates`.
  3. Compose daemon proxy env (R-4): `HTTP_PROXY`/`HTTPS_PROXY` from `$HTTPS_PROXY`,
     `NO_PROXY` from `$NO_PROXY` (fallback `localhost,127.0.0.1,::1,host.docker.internal`).
  4. Launch detached (R-1): `setsid env <proxy> dockerd --storage-driver=vfs
     --host=unix:///var/run/docker.sock --pidfile=/var/run/docker.pid` with stdio →
     `/var/log/dockerd.log`, `&` + `disown`.
  5. Readiness wait (R-6): poll `docker info` up to ~30s; log success or a clear
     timeout (tail the log), return non-zero on timeout so the caller can log it.
- [ ] **Step 2: Wire into the hook** — add a cloud-only step 3 in
  `cloud-session-setup.sh` that calls `start-dockerd.sh` best-effort (failure logged,
  hook still exits 0 — Docker is an enhancement, not a hard dep of the session).
- [ ] **Step 3: Validate (AC-1/2/3/4)** —
  - `bash scripts/start-dockerd.sh` → `docker info` exit 0 (AC-1).
  - `docker pull postgres:17` exit 0 (AC-3).
  - `./gradlew cleanTest test --tests "ai.riviera.platform.venue.*"` → 6 ITs run,
    0 skipped, all pass (AC-2).
  - Run `CLAUDE_CODE_REMOTE` unset → dockerd step skipped (AC-4).
- [ ] **Step 4: Confirm AC-5** — `git diff` shows nothing under
  `platform/src/test/java/ai/riviera/platform/`.
- [ ] **Step 5: Commit** — `git commit -m "..." (#39)` and update this status table.

## Phase 1 — Doc note

**Files:** Create `docs/agents/docker-testcontainers.md`

- [ ] Document: how the daemon is provided (SessionStart hook → `start-dockerd.sh`),
  the manual fallback one-liner, the `vfs` + proxy-CA + `HTTP(S)_PROXY` gotchas, and
  the lifecycle warning (never `pkill -f dockerd`; `kill "$(cat /var/run/docker.pid)"`).
  (AC-6).
- [ ] Commit and update status.

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `docker info` exit 0 post-hook.
- [ ] **AC-2:** venue ITs run / 0 skipped / pass.
- [ ] **AC-3:** `docker pull postgres:17` exit 0.
- [ ] **AC-4:** local (non-cloud) run skips dockerd.
- [ ] **AC-5:** no diff under the test condition classes.
- [ ] **AC-6:** doc note present with manual one-liner.
- [ ] **AC-7:** no secrets in the diff; CI green.

## Self-review checklist (before merge / PR)

- [ ] No JPA / availability / payment / modulith / frontend concerns touched (all N/A,
  justified above).
- [ ] `@EnabledIfDockerAvailable` + `DockerAvailableCondition` unchanged (AC-5).
- [ ] Scripts idempotent, cloud-gated, non-interactive; no `pkill -f dockerd`.
- [ ] No secrets committed (AC-7).
- [ ] Execution-status table matches reality at HEAD.
- [ ] Open Questions empty or deferred with an issue #.
