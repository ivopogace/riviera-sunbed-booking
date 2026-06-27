# [F3] CI/CD pipeline — Implementation Plan

> **For agentic workers:** implement with `implement` + `tdd` discipline adapted to
> devops — the "test" for a workflow is a **green run on the PR**; YAML is validated
> by parsing + the real Actions run, not a unit test. Steps use `- [ ]` tracking.
>
> **Riviera discipline note:** this is a **devops/CI** feature with **no application
> code**. The Availability, Payment/Payout, Spring-Modulith-boundary, Angular-surface,
> and FE↔BE-contract sections are honestly `N/A` and say why. The only product-code
> files touched are build-tooling additions for coverage (`platform/build.gradle`
> JaCoCo, `frontend/package.json` Vitest coverage provider) — no behavior changes.

**Goal:** Every push (all branches) and every PR into `main` builds both apps, runs
their tests, and runs vulnerability + code-quality scans; a PR into `main` is only
mergeable when the required checks are green.

**Architecture:** GitHub Actions with two build jobs (backend on JDK 25 via
`setup-java`; frontend on Node 26 via `.nvmrc`), a CodeQL workflow (matrix `java` +
`javascript`, `build-mode: none` to sidestep the JDK-25 toolchain in the scanner),
Dependabot config, and SonarCloud wired but **secret-gated** so the pipeline is green
now and the Sonar reporting activates the moment the maintainer adds `SONAR_TOKEN` +
creates the project. The single most significant decision is **secret-gated Sonar**:
author-now / wire-later, so no human dependency blocks a green pipeline.

**Persistence:** N/A — no DB/migration in scope (invariant #1, #12 untouched). The
backend build adds a JaCoCo report only; no schema, no SQL.

**Source of intent:** GitHub issue **#3** ([F3] CI/CD pipeline). Unblocked by **#13**
(F1 backend) and **#15** (F2 frontend), both merged. Reconciliation comments on #3
(`comment-4815964000`, `comment-4819136871`) carry the Node-26 / JaCoCo / Vitest-
coverage corrections folded in here.

**Branch:** `feature/ci-pipeline` ✅ created off `main` (`7a3e3a0`) and checked out.

---

## Acceptance criteria (testable)

> From issue #3. "Testable" for CI = an **observable run state** on the actual PR,
> plus locally-verifiable coverage-tooling outputs where possible.

- [ ] **AC-1:** Given a push to `feature/ci-pipeline` and a PR into `main`, when the
  `CI` workflow runs, then the **backend** job (`./gradlew build test` on JDK 25,
  cached) completes green. *Pinned by:* the `backend` job conclusion on the PR's
  Actions run.
- [ ] **AC-2:** Given the same trigger, when the `CI` workflow runs, then the
  **frontend** job (`npm ci` → `npm run lint` → `npm test` once (Vitest) →
  `npm run build`, Node pinned via `.nvmrc`, cached) completes green and lint is a
  hard gate (any ESLint error → red). *Pinned by:* the `frontend` job conclusion.
- [ ] **AC-3:** Given the same trigger, when **CodeQL** runs, then analysis
  **completes for both `java` and `javascript`** and reports a check. *Pinned by:*
  the `CodeQL` workflow conclusion + the two analyze checks on the PR.
- [ ] **AC-4:** Given the repo, when Dependabot reads `.github/dependabot.yml`, then it
  is **active for `gradle` (`/platform`), `npm` (`/frontend`), and `github-actions`**.
  *Pinned by:* the repo Insights → Dependency graph → Dependabot tab showing the three
  ecosystems (and/or the first Dependabot PRs/Security tab).
- [ ] **AC-5:** Given `@vitest/coverage-v8` installed, when CI runs
  `ng test --coverage --coverage-reporters lcovonly`, then `frontend/coverage/frontend/lcov.info`
  is produced. *Pinned by:* local dry-run (Node 26) + the artifact in the frontend job.
- [ ] **AC-6:** Given the JaCoCo plugin, when CI runs `./gradlew build jacocoTestReport`,
  then `platform/build/reports/jacoco/test/jacocoTestReport.xml` is produced. *Pinned
  by:* local JDK-21 smoke + the report in the backend job.
- [ ] **AC-7:** Given `SONAR_TOKEN` is **present**, when CI runs, then SonarCloud
  analysis runs for FE and BE and reports a quality-gate check on the PR; given the
  secret is **absent**, the Sonar steps are **skipped** and the pipeline stays green.
  *Pinned by:* the secret-gated `if:` condition + (post-human-setup) the SonarCloud
  check on a PR. **(Human-gated — see Ready-for-human.)**
- [ ] **AC-8:** Given branch protection on `main` requiring the CI + CodeQL checks,
  when a PR has any required check red, then merge is blocked. *Pinned by:* the branch
  protection settings on `main`. **(Human-gated — see Ready-for-human.)**

## Non-goals

> Guards against "while I'm here…".

- **Not** adding deploy/release/publish stages — CI only, no CD to any environment.
- **Not** adding a foojay toolchain resolver to `settings.gradle` (would let local
  devs auto-provision JDK 25). Out of F3 scope (it edits F1's build setup); CI gets
  JDK 25 from `setup-java`. Noted in #3 reconciliation as a deferred optional.
- **Not** changing the `lint` script to `--max-warnings 0` (warn-level gate). The F2
  enforcement comment explicitly deferred that to keep PR #15 scope-clean; warns stay
  non-blocking until a maintainer opts in.
- **Not** running the Testcontainers integration test's *behavior* differently — it
  stays `@EnabledIfDockerAvailable`; on `ubuntu-latest` (Docker present) it executes,
  elsewhere it skips cleanly. No new integration tests authored.
- **Not** creating the SonarCloud project, adding the `SONAR_TOKEN` secret, or
  enabling branch protection — those are maintainer-only (Ready-for-human).

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Backend toolchain pins JDK **25**; the runner lacks it → build fails (this is exactly what failed in the sandbox dry-run). | high (if unhandled) | high | `actions/setup-java@v4` `distribution: temurin`, `java-version: 25`; Gradle auto-detects the installed JDK 25 (no foojay needed). | agent | open until AC-1 green |
| R-2 | CodeQL `java` autobuild can't satisfy the JDK-25 toolchain → analysis fails. | med | med | Use `build-mode: none` for `java` (source-level extraction, no toolchain). `javascript` needs no build. | agent | open until AC-3 green |
| R-3 | Node version skew: CI Node ≠ local Node 26 → build/test differences. | low | med | `setup-node` with `node-version-file: .nvmrc` (= `26.0.0`), matching local + web/cloud. | agent | open until AC-2 green |
| R-4 | Sonar steps hard-fail the pipeline because `SONAR_TOKEN`/project don't exist yet → red CI blocks all work. | high (if ungated) | high | Job-level `env.SONAR_TOKEN` + step `if: env.SONAR_TOKEN != ''`; skipped cleanly when absent. Pipeline green pre-wiring. | agent | open until AC-7 design in place |
| R-5 | FE coverage run errors — `@angular/build:unit-test` needs `@vitest/coverage-v8` (verified absent in dry-run). | high (if unhandled) | med | Add `@vitest/coverage-v8` devDependency; pin to the Vitest 4.x line. | agent | open until AC-5 green |
| R-6 | Gradle/npm dependency download flakiness on the runner. | low | low | `gradle/actions/setup-gradle@v4` + `actions/setup-node` cache; default retries. | agent | open |
| R-7 | A committed file leaks a secret/token. | low | high | No secrets in YAML — only `${{ secrets.* }}` refs; `riviera-review-overlay` secret check + `run_secret_scanning` before merge. | agent | open until pre-merge review |
| R-8 | `push` on **all branches** double-runs CI for PR branches (push + pull_request). | low | low | Accept duplicate on PR branches (cheap, jobs cached); `concurrency` group cancels superseded runs per ref. | agent | open |

## Open questions / Assumptions

- **Assumption:** SonarCloud topology = **two projects** bound to this repo
  (`*-backend` via the Gradle `org.sonarqube` plugin, `*-frontend` via the scan
  action), idiomatic per-stack. The maintainer can collapse to one project later;
  config keys are documented in Ready-for-human and trivially editable. — *Owner:*
  maintainer · *Resolves by:* SonarCloud setup.
- **Assumption:** Temurin **JDK 25 GA** is available to `setup-java@v4` (Java 25 is the
  Sept-2025 LTS; Adoptium publishes it). — *Owner:* agent · *Resolves by:* AC-1 green.
- **Assumption:** the maintainer wants CodeQL + both CI jobs as the **required**
  checks on `main` (not Sonar, which is additive until wired). — *Owner:* maintainer ·
  *Resolves by:* branch-protection setup.
- **Open question:** none blocking. No material scope change surfaced in the audit.

## Availability & concurrency (invariant #2)

`N/A — devops/CI only; no `booking`, `availability`, or beach-map code is touched. No
write path to `availability(set_id, booking_date)` exists in this change.`

## Spring Modulith — modules, interfaces, events

`N/A — no module code, no `api/` ports, no domain events. The only backend file
touched is `platform/build.gradle` (adds the `jacoco` plugin + XML report); it crosses
no module boundary and the `ApplicationModules.verify()` test is unaffected. Invariant
#1 (no JPA) is preserved — JaCoCo is a test-coverage plugin, not a persistence change.`

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment or payout code; no money moves in a CI pipeline.`

## Angular — frontend surfaces touched

`N/A — no components/services/templates. The only `frontend/` change is build tooling:
`package.json` gains `@vitest/coverage-v8` (dev) + a coverage test script; no UI.`

## FE↔BE contract

`N/A — no API shape changes.`

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Backend coverage tooling (JaCoCo) | ✅ | `7010979` |
| 1 — Frontend coverage tooling (Vitest v8) | ✅ | `5d8d767` |
| 2 — Core CI workflow (backend + frontend jobs) | ✅ | `bbd911f` |
| 3 — CodeQL + Dependabot | ✅ | `210d1f6` |
| 4 — SonarCloud wiring (secret-gated) | ✅ | (this commit) |
| 5 — PR, green-gate, Ready-for-human | ⏳ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

---

## File structure

- `.github/workflows/ci.yml` — **new.** `push` (all branches) + `pull_request`→`main`.
  Jobs: `backend` (JDK 25, gradle cache, `./gradlew build jacocoTestReport`, secret-
  gated Sonar), `frontend` (Node via `.nvmrc`, npm cache, `npm ci`/`lint`/`test
  --coverage`/`build`, secret-gated Sonar). `concurrency` cancels superseded runs.
- `.github/workflows/codeql.yml` — **new.** Matrix `java` + `javascript`,
  `build-mode: none`; `push`/`pull_request`→`main` + weekly `schedule`. Least-
  privilege `permissions` (`security-events: write`).
- `.github/dependabot.yml` — **new.** Ecosystems: `gradle` (`/platform`), `npm`
  (`/frontend`), `github-actions` (`/`); weekly.
- `platform/build.gradle` — **modify (Phase 0).** Add `id 'jacoco'`; enable XML report;
  make the report run after `test`. (No Sonar Gradle plugin — see Phase 4 decision.)
- `frontend/package.json` — **modify.** Add `@vitest/coverage-v8` devDependency and a
  `"test:coverage"` script (`ng test --coverage --coverage-reporters lcovonly`).
- `frontend/package-lock.json` — **modify.** Regenerated by `npm install` for the new dep.
- `platform/sonar-project.properties` — **new (Phase 4).** BE Sonar project key/org +
  `sonar.java.binaries` + `sonar.coverage.jacoco.xmlReportPaths`.
- `frontend/sonar-project.properties` — **new (Phase 4).** FE Sonar project key/org +
  `sonar.javascript.lcov.reportPaths=coverage/frontend/lcov.info`, sources/exclusions.
- `docs/plans/ci-pipeline.md` — **this plan.**

---

## Phase 0 — Backend coverage tooling (JaCoCo)

**Files:** Modify `platform/build.gradle`

- [ ] **Step 1 (red):** Confirm no JaCoCo XML is produced today — `./gradlew tasks`
  has no `jacocoTestReport`. (Devops "red": the report path is absent.)
- [ ] **Step 2: Implement** — add to `platform/build.gradle`:

```gradle
plugins {
	id 'java'
	id 'jacoco'
	id 'org.springframework.boot' version '4.1.0'
	id 'io.spring.dependency-management' version '1.1.7'
}
```

and after the `test` task block:

```gradle
jacocoTestReport {
	dependsOn test
	reports {
		xml.required = true
		html.required = false
	}
}

tasks.named('test') {
	useJUnitPlatform()
	finalizedBy jacocoTestReport
}
```

- [ ] **Step 3 (green):** Smoke-verify the report generates. JDK 25 is unavailable in
  the sandbox, so: back up the JaCoCo-edited `build.gradle`, temporarily flip the
  toolchain to the locally-present JDK 21 (`sed -i 's/of(25)/of(21)/'`), run
  `./gradlew build jacocoTestReport`, confirm
  `build/reports/jacoco/test/jacocoTestReport.xml` exists, then **restore** the backup
  (JaCoCo edit kept, toolchain back to 25). → XML present.
- [ ] **Step 4: Commit** — `git commit -m "ci: add JaCoCo XML coverage report to backend build (#3)"`
- [ ] **Step 5: Update execution status** in the same commit window.

## Phase 1 — Frontend coverage tooling (Vitest v8 provider)

**Files:** Modify `frontend/package.json`, `frontend/package-lock.json`

- [ ] **Step 1 (red):** `cd frontend && npx ng test --coverage --coverage-reporters lcovonly`
  → FAILS today with `Code coverage requires "@vitest/coverage-v8"…` (verified in dry-run).
- [ ] **Step 2: Implement** — `npm install -D @vitest/coverage-v8@^4` and add the script:

```json
"scripts": {
  "test:coverage": "ng test --coverage --coverage-reporters lcovonly"
}
```

- [ ] **Step 3 (green):** `npm run test:coverage` → tests pass and
  `frontend/coverage/frontend/lcov.info` exists. (Fully verifiable locally on Node 26 — no JDK.)
- [ ] **Step 4: Commit** — `git commit -m "ci: add Vitest v8 coverage provider + lcov script for frontend (#3)"`
- [ ] **Step 5: Update execution status.**

## Phase 2 — Core CI workflow (backend + frontend jobs)

**Files:** Create `.github/workflows/ci.yml`

- [ ] **Step 1: Implement** `ci.yml`:
  - `on:` `push:` (no branch filter = all branches) + `pull_request:` `branches: [main]`.
  - `concurrency:` group `${{ github.workflow }}-${{ github.ref }}`, `cancel-in-progress: true`.
  - `permissions:` `contents: read`.
  - **`backend`** job (`ubuntu-latest`): `actions/checkout@v4` → `actions/setup-java@v4`
    (`temurin`, `java-version: 25`) → `gradle/actions/setup-gradle@v4` (cache) →
    `./gradlew build jacocoTestReport` (working dir `platform`).
  - **`frontend`** job (`ubuntu-latest`): `actions/checkout@v4` → `actions/setup-node@v4`
    (`node-version-file: frontend/.nvmrc`? — `.nvmrc` is at repo root → use
    `node-version-file: .nvmrc`; `cache: npm`, `cache-dependency-path: frontend/package-lock.json`)
    → `npm ci` → `npm run lint` → `npm run test:coverage` → `npm run build`
    (all `working-directory: frontend`).
- [ ] **Step 2 (green):** Validate YAML parses locally (`python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml'))"`); the real green is the PR run (Phase 5).
- [ ] **Step 3: Commit** — `git commit -m "ci: add core build/test workflow for backend + frontend (#3)"`
- [ ] **Step 4: Update execution status.**

## Phase 3 — CodeQL + Dependabot

**Files:** Create `.github/workflows/codeql.yml`, `.github/dependabot.yml`

- [ ] **Step 1: Implement** `codeql.yml`:
  - `on:` `push`/`pull_request` → `main` + `schedule` (weekly cron).
  - `permissions:` `security-events: write`, `contents: read`, `actions: read`.
  - `strategy.matrix.language: [java, javascript]`; `github/codeql-action/init@v3`
    with `build-mode: none`; `github/codeql-action/analyze@v3`.
- [ ] **Step 2: Implement** `dependabot.yml`: `version: 2`; updates for
  `package-ecosystem: gradle` (`/platform`), `npm` (`/frontend`), `github-actions`
  (`/`); `schedule.interval: weekly`.
- [ ] **Step 3 (green):** YAML parse-check both files. Real green = PR run + the
  Dependabot tab.
- [ ] **Step 4: Commit** — `git commit -m "ci: add CodeQL analysis (java+javascript) and Dependabot config (#3)"`
- [ ] **Step 5: Update execution status.**

## Phase 4 — SonarCloud wiring (secret-gated)

**Files:** Create `platform/sonar-project.properties`, `frontend/sonar-project.properties`; modify `.github/workflows/ci.yml`

> **Decision:** use the `SonarSource/sonarqube-scan-action` uniformly for **both** FE
> and BE rather than the Gradle `org.sonarqube` plugin. Rationale: it avoids pinning a
> fragile Gradle-plugin build number, keeps FE/BE config symmetric, and Dependabot's
> `github-actions` ecosystem keeps the action current. The Sonar Java analyzer reads
> the compiled classes (`build/classes/java/main`, produced by `./gradlew build`) +
> the JaCoCo XML — no plugin needed. `build.gradle` is therefore **not** touched here.

- [ ] **Step 1: Implement BE** — `platform/sonar-project.properties` with
  `sonar.projectKey`, `sonar.organization`, `sonar.sources=src/main/java`,
  `sonar.java.binaries=build/classes/java/main`,
  `sonar.coverage.jacoco.xmlReportPaths=build/reports/jacoco/test/jacocoTestReport.xml`.
- [ ] **Step 2: Implement FE** — `frontend/sonar-project.properties` with
  `sonar.projectKey`, `sonar.organization`, `sonar.sources=src`,
  `sonar.javascript.lcov.reportPaths=coverage/frontend/lcov.info`, sensible `sonar.exclusions`.
- [ ] **Step 3: Gate in `ci.yml`** — set job-level `env: SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}`
  on both jobs; add a Sonar step to each with `if: ${{ env.SONAR_TOKEN != '' }}` using
  `SonarSource/sonarqube-scan-action@v4` (`projectBaseDir: platform` / `frontend`,
  `SONAR_HOST_URL: https://sonarcloud.io`). Absent secret → steps skipped → green.
- [ ] **Step 4 (green):** YAML parses; the scan steps are skipped when no secret is set
  (the default state until the maintainer wires it). Live Sonar verification happens
  after the maintainer adds the secret + project (AC-7).
- [ ] **Step 5: Commit** — `git commit -m "ci: wire SonarCloud for FE + BE, secret-gated on SONAR_TOKEN (#3)"`
- [ ] **Step 6: Update execution status.**

## Phase 5 — PR, green-gate, Ready-for-human

- [ ] **Step 1: Push** `feature/ci-pipeline`; open PR into `main` referencing #3.
- [ ] **Step 2: Observe** the Actions run. Any red → `diagnosing-bugs` loop (re-diagnose,
  fix, push), **not** encode-as-is. Iterate until backend + frontend + CodeQL are green.
- [ ] **Step 3: Pre-merge review** via `riviera-review-overlay` — devops, so most bank
  items N/A; **confirm no secrets committed** (R-7) and run `run_secret_scanning`.
- [ ] **Step 4: Post the Ready-for-human checklist** (below) on the PR/issue.
- [ ] **Step 5: Update execution status; do NOT merge** without green checks + maintainer approval.

### Ready-for-human (maintainer-only; pipeline authored, these wire it live)

1. **Create the SonarCloud project(s)** for this repo (org + project key(s) — default
   assumption: `*-backend` + `*-frontend`; adjust keys in `platform/build.gradle`
   `sonar { }` and `frontend/sonar-project.properties` if you choose one project).
2. **Add the `SONAR_TOKEN` repo secret** (Settings → Secrets → Actions). Until then,
   Sonar steps skip and CI stays green; once added they activate automatically.
3. **Enable branch protection on `main`** requiring: the `backend` + `frontend` CI
   checks and the CodeQL `java` + `javascript` checks (and Sonar once wired). This is
   what makes AC-8 ("`main` can't merge red") true. CodeQL/Dependabot need no secrets.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** backend job green on the PR run. Verified at `<sha>`.
- [ ] **AC-2:** frontend job green (lint hard-gates) on the PR run. Verified at `<sha>`.
- [ ] **AC-3:** CodeQL `java` + `javascript` analyses complete. Verified at `<sha>`.
- [ ] **AC-4:** Dependabot active for gradle + npm + github-actions. Verified via Insights.
- [ ] **AC-5:** `frontend/coverage/frontend/lcov.info` produced. Verified locally + in CI artifact.
- [ ] **AC-6:** `jacocoTestReport.xml` produced. Verified via JDK-21 smoke + CI.
- [ ] **AC-7:** Sonar reports when `SONAR_TOKEN` present; skips (green) when absent.
  Live half verified post-human-setup.
- [ ] **AC-8:** `main` blocks merge on a red required check. Verified post-branch-protection.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying signal (run state or local output).
- [ ] No placeholders / TODO / TBD in the workflows or this doc.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; JaCoCo is coverage-only (invariant #1).
- [ ] Availability section justified `N/A` (no app code) — invariant #2 untouched.
- [ ] Modulith section justified `N/A`; the one backend edit (`build.gradle`) crosses no boundary (invariant #11).
- [ ] Payment/payout `N/A`; no money moves (invariants #5/#8/#9 untouched).
- [ ] **No secrets committed** — only `${{ secrets.* }}` references (R-7); `run_secret_scanning` clean.
- [ ] Node pinned via `.nvmrc` (26.0.0); JDK pinned to 25 via `setup-java` (R-1/R-3).
- [ ] Sonar is secret-gated and cannot red the pipeline pre-wiring (R-4).
- [ ] Execution-status table at HEAD matches reality.
- [ ] Risk register has no stale `open` rows at done; Open Questions empty (or deferred with an issue #).
