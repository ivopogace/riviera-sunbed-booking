# Riviera map archive storage Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** ADR-0022 records how the ~60 MB PMTiles archive is stored (committed, unchanged) with
three concrete revisit triggers and measured size levers, and a backend test fails the build the
moment a regeneration pushes the committed archive past the 80 MB trigger.

**Architecture:** Status quo storage, made safe by a machine-held size budget: `MapArchiveBudgetTest`
reads the committed file's size (metadata only) and fails naming ADR-0022, so the decision reopens
on exactly the regeneration PR that crosses it. The regeneration-count trigger is a runbook step;
the production-pipeline trigger is ADR text. No deploy, Dockerfile or script change.

**Persistence:** JDBC only (invariant #1). No tables or migrations touched.

**Source of intent:** GitHub issue #1109 (follow-up of PR #1105 / issue #1103, epic #806); the
issue-intake grill with Ivo on 2026-09-16.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught two stale
ADR-0022 premises: the repo is public, and Render's own feature tracker indicates its clone
*does* fetch LFS objects; surfaced that production will not be on Render and the repo will
likely go private) · `riviera-plan-doc` (this template — forced the budget test's red proof and the
empty Open-questions register) · `tdd` (budget test run red with the budget lowered below the
current archive size before being set to the trigger) · `riviera-review-overlay` (review gate —
at ready-for-review) · `riviera-docs-freshness` (close-out — pending) · `grilling` (three
AskUserQuestion rounds: cadence, visibility, storage, triggers, enforcement, inland zoom, unused
layers) · `riviera-java-conventions` (JUnit 5 plain assertions matching `MapStyleSelfHostedTest`,
named constants for the path and budget, one-line comments) · `riviera-modulith` (test lives with
`MapResourcesConfig` in the root package — map resources are owned by no module) ·
`domain-modeling` (no glossary change; amendment to ADR-0022 rather than a new ADR — same decision,
re-weighed options)

**Branch:** `feature/riviera-map-archive-storage`

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the committed archive `platform/map/riviera.pmtiles`, when the backend test
  suite runs, then it passes while the archive is at most 80,000,000 bytes and fails with a message
  naming ADR-0022's size trigger when it is larger (or missing). *Seam:* the committed file under
  `riviera.map.dir` (`platform/map/`) that the image copies and `MapResourcesConfig` serves ·
  *Pinned by:* `MapArchiveBudgetTest.committedArchiveStaysUnderTheRevisitBudget` (red proof: budget
  temporarily set to 60,000,000 → FAIL with the ADR-naming message).
- [ ] **AC-2:** Given ADR-0022, when a reader asks how the archive is stored and when that is
  reconsidered, then the ADR states: committed storage kept, sized against a yearly regeneration
  cadence; the three revisit triggers (archive over 80 MB, more than 2 regenerations in any
  12 months, the production deploy pipeline being chosen); the measured size levers in order
  (drop never-drawn layers −3.38 MB → 56.99 MB; max zoom 13 → 27.16 MB; coast/inland split →
  48.80 MB or 30.96 MB); and re-weighed rejections of a release asset, Git LFS and split archives
  whose reasons match today's facts. *Seam:* `docs/adr/ADR-0022-self-hosted-map-resources.md` ·
  *Pinned by:* review gate + `riviera-docs-freshness` (doc AC — no executable seam).
- [ ] **AC-3:** Given an operator regenerating per the runbook, when they reach the commit step,
  then the runbook has them count the archive's commits on `origin/main` in the last 12 months
  (unshallowing first) and revisit ADR-0022 before committing if two already exist; it names the
  size-budget test in the verify command and says GitHub's GH001 large-file warning is expected
  below 100 MiB. *Seam:* `docs/runbooks/riviera-map-tiles.md` · *Pinned by:* review gate (doc AC).

## Non-goals

- Changing where the archive is stored or how the image gets it (no Dockerfile, deploy workflow,
  `docs/deploy/` or `.gitattributes` change).
- Regenerating the archive, or excluding layers / lowering zoom in `scripts/build-riviera-map.sh`
  — the levers are recorded, not pulled.
- Shrinking coverage back from all of Albania (issue out-of-scope).
- Rewriting git history to drop the committed archive.
- Choosing the production host.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — new behavior, replaces nothing.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The budget test passes vacuously (wrong working directory, archive absent) | low | med | assert existence first; red proof with the budget lowered below the real size | Claude | closed — red run failed on the size assertion (line 26), not on existence |
| R-2 | The ADR states the Render-LFS behaviour as verified fact when it rests on a feature-tracker thread | med | low | phrase it as evidence with its source; the LFS rejection rests on the bandwidth arithmetic and production not being on Render, not on that claim | Claude | closed — ADR phrases it as "appears to fetch … not verified by a build of ours, and not what this rejection rests on" |
| R-3 | The count trigger under-counts on a shallow clone (cloud sessions) | med | low | runbook step unshallows first, as `riviera-local-debug` § *Git in a cloud session* prescribes | Claude | closed — runbook count block unshallows and fetches `origin main` first |
| R-4 | A future "fix" raises the budget constant instead of revisiting the decision | low | med | the test's Javadoc and failure message name ADR-0022 and say the budget is the ADR's trigger, not a tunable | Claude | closed — Javadoc, failure message and runbook all say revisit, never raise the budget |

## Open questions / Assumptions

None open.

### Resolved

- **Regeneration cadence** → about once a year before the season, plus rare one-offs (grill,
  2026-09-16, Ivo).
- **Repository visibility / production host** → production will not be hosted on Render and the
  repository will likely go private; the ADR records the production-pipeline choice as a revisit
  trigger rather than naming a Render-shaped fallback (grill, 2026-09-16, Ivo).
- **Storage** → keep committing the archive (grill, 2026-09-16, Ivo).
- **Triggers** → 80 MB; more than 2 regenerations in any 12 months; production deploy pipeline
  chosen. Size held by a backend test, count by a runbook step (grill, 2026-09-16, Ivo).
- **Map detail** → zoom 14 everywhere; the three never-drawn layers stay, recorded as the first
  size lever (grill, 2026-09-16, Ivo).
- **Measured sizes** → from the committed archive's own tile directory and re-gzipped tiles
  (calibration 1.0078× Planetiler's gzip, cancelled by ratio projection): as built 60,364,946 B;
  z14 is 55.0 % of tile data; drop `mountain_peak`+`housenumber`+`aerodrome_label` → 56,986,142 B;
  max zoom 13 → 27,162,334 B; z14 only in a ~60–90 km coastal strip → 48,796,967 B; z14 only in
  the Vlorë–Ksamil box → 30,963,742 B.

## Availability & concurrency (invariant #2)

N/A — does not affect availability: a static map-resource budget and documentation; no booking,
availability or beach-map path is touched.

## Spring Modulith — modules, interfaces, events

**Modules touched**

N/A — test-only change in the root package's test tree beside `MapResourcesConfigTest`; no module,
port or event.

**Cross-module named interfaces (`api/` ports)**

N/A — none added or changed.

**Domain events (id-based payloads, invariant #11)**

N/A — none added or changed.

### Module ownership (§4a)

All at the root: the riviera map resources are the root's `MapResourcesConfig` concern, owned by
no module (`RESPONSIBILITIES.md` § *Platform edge* → *Riviera map resources*); no boundary change.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

N/A — backend test and docs only.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** CI gate (phase 2 pushed) → then merge `origin/main`, mark ready for review

**Next action:** confirm the phase-2 push's CI run is green, merge latest `origin/main`, mark PR #1117 ready for review, run the review gate (`references/pr-gates.md` §1).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan doc + draft PR (#1117) | ✅ | `822f3e77` |
| 1 — archive size-budget test | ✅ | this commit — red at a 60,000,000-byte budget (`…60364946 bytes, over the 60000000-byte budget: revisit ADR-0022…`), green at 80,000,000 with `MapStyleSelfHostedTest` + `MapResources*` (10 tests, 0 skipped) |
| 2 — ADR-0022 amendment + runbook + RESPONSIBILITIES pointer | ✅ | this commit — decision 7 (storage, triggers, measured levers), re-weighed release-asset / LFS / split options, amendment log; runbook cadence, budget test, count step, GH001 note; RESPONSIBILITIES clause. Guards: plan-file-structure + inline-comments exit 0 |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `docs/plans/riviera-map-archive-storage.md` — this plan.
- `platform/src/test/java/ai/riviera/platform/MapArchiveBudgetTest.java` — the 80 MB size trigger, machine-held.
- `docs/adr/ADR-0022-self-hosted-map-resources.md` — storage decision, triggers, levers, re-weighed options, amendment-log entry.
- `docs/runbooks/riviera-map-tiles.md` — count-trigger step, budget test in the verify command, GH001 note.
- `RESPONSIBILITIES.md` — one clause naming the budget and its test in § *Riviera map resources*.

---

## Phase 1 — Archive size-budget test

**Files:** Create `platform/src/test/java/ai/riviera/platform/MapArchiveBudgetTest.java`

- [ ] **Step 1: Write the test with the budget below the current archive (red proof)**

```java
package ai.riviera.platform;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The committed tile archive stays within the size at which ADR-0022 reopens its storage decision.
 * The budget is the ADR's revisit trigger, not a tunable: an archive over it means revisiting the
 * decision (the ADR lists the measured size levers in order), never raising the constant.
 */
class MapArchiveBudgetTest {

	/** Gradle runs tests from {@code platform/}, where the served directory lives. */
	private static final Path ARCHIVE = Path.of("map", "riviera.pmtiles");
	private static final long REVISIT_BUDGET_BYTES = 60_000_000L;

	@Test
	void committedArchiveStaysUnderTheRevisitBudget() throws IOException {
		assertTrue(Files.exists(ARCHIVE), "missing " + ARCHIVE.toAbsolutePath() + " — run scripts/build-riviera-map.sh --tiles");
		long size = Files.size(ARCHIVE);
		assertTrue(size <= REVISIT_BUDGET_BYTES, "the riviera map archive is " + size + " bytes, over the "
				+ REVISIT_BUDGET_BYTES + "-byte budget: revisit ADR-0022's storage decision before committing it");
	}
}
```

- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*MapArchiveBudgetTest*"` → FAIL
  with `the riviera map archive is 60364946 bytes, over the 60000000-byte budget: revisit ADR-0022…`

- [ ] **Step 3: Set the budget to the ADR's trigger** — `REVISIT_BUDGET_BYTES = 80_000_000L`.

- [ ] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*MapArchiveBudgetTest*" --tests "*MapStyleSelfHostedTest*" --tests "*MapResources*"` → PASS

- [ ] **Step 5: Generalization-audit pass** — N/A: a new fitness check, not a bug fix.

- [ ] **Step 6: Commit** — `git commit -m "Hold the riviera map archive to ADR-0022's 80 MB revisit budget (#1109)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 2 — ADR-0022 amendment, runbook, RESPONSIBILITIES

**Files:** Modify `docs/adr/ADR-0022-self-hosted-map-resources.md` · `docs/runbooks/riviera-map-tiles.md` · `RESPONSIBILITIES.md`

- [ ] **Step 1: ADR-0022** — Decision 4 gains the storage clause (committed, yearly cadence, the
  three triggers, the budget test); a *Size levers* list with the measured sizes; *Considered
  options* re-weighs the release asset (no token while public, `ADD --checksum` makes absence loud;
  costs a build-time hop, a local fetch step, a token once private), Git LFS (bandwidth at the
  deploy rate; a registry pipeline otherwise), and split archives / coast-only zoom 14 (one archive
  cannot hold z14 on the coast only — MapLibre draws a missing in-range tile blank — so two sources
  and a duplicated style); the Consequences growth bullet points at the triggers; amendment-log
  entry for #1109.
- [ ] **Step 2: Runbook** — verify command gains `*MapArchiveBudgetTest*`; a pre-commit step counts
  `git log origin/main --since="12 months ago" -- platform/map/riviera.pmtiles` after unshallowing,
  and stops to revisit ADR-0022 at two; the GH001 note.
- [ ] **Step 3: RESPONSIBILITIES.md** — one clause: the archive is committed within ADR-0022's size
  budget, held by `MapArchiveBudgetTest`.
- [ ] **Step 4: Verify** — `node scripts/check-plan-file-structure.mjs --diff origin/main`;
  `node scripts/check-inline-comments.mjs --diff origin/main`; the backend `ResponsibilitiesArchitectureTests` if it parses test names.
- [ ] **Step 5: Commit + update Execution status.**

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** Run `./gradlew test --tests "*MapArchiveBudgetTest*"` → PASS at 80 MB budget; FAIL at 60 MB budget. Verified at commit `<sha>`.
- [ ] **AC-2:** ADR-0022 diff reviewed at the review gate. Verified at commit `<sha>`.
- [ ] **AC-3:** Runbook diff reviewed at the review gate. Verified at commit `<sha>`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (or justified N/A); concurrency test present (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based (invariant #11).
- [ ] **Payment/payout** section filled (or N/A); webhooks are source of truth; idempotent; money in minor units; payout exactly-once (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10).
- [ ] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6).
- [ ] Booking codes unguessable (invariant #7).
- [ ] Flyway migration present for schema changes; invariant-enforcing constraints tested (invariant #12).
- [ ] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register (no finding row left `open` without a decision).
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR, in its last code-touching commit** — the plan doc's final state is committed here, citing `merged via PR #NN`, and no docs-only commit follows it.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone. If tooling blocked the review, that is stated in the PR and its checkbox is left unticked.
