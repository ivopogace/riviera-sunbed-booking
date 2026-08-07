# Strip issue-number provenance from Javadoc/TSDoc (§6d compliance pass)

**Issue:** #550 · **Branch:** `claude/issue-550-decision-probe-6heh4x` (batch 1; later batches
restart the branch from `main` after each merge) · **Type:** repo-wide mechanical sweep
(comment-only) · **Parent:** #544 (`docs/plans/comment-volume-trim.md` holds the measurement
this scope came from)

**Goal:** no doc comment in the four source trees carries a 3–4-digit `#nnn` issue reference,
so `riviera-java-conventions` §6d / the `frontend/.claude/CLAUDE.md` TSDoc twin stop being
aspirational — without breaking a sentence, dropping a load-bearing rationale, or changing a
byte of code.

**Architecture:** N/A — comment-only by construction, proved per batch by
`scripts/check-comment-only.mjs`. The one structural decision is the batching shape (below),
re-priced from the measured 10-file probe rather than taken from the issue as filed.

**Persistence:** N/A — no schema, no SQL, no code.

**Source of intent:** issue #550; measurement in `docs/plans/comment-volume-trim.md`
(*The axis this sweep never measured* / *Scoped follow-up*).

**Skills consulted:** `riviera-sdlc` (routing; rule-11 — this doc is the state store) ·
`riviera-plan-doc` (this template; forced the R-4 probe-generalisation caveat into the open) ·
`tdd` (N/A — no behavior; the "tests" are the inertness gates, run per batch) ·
`riviera-review-overlay` (due at every batch's review gate — AC-4 is review-only, no script
can see a broken sentence) · `riviera-docs-freshness` (N/A for batch 1 — comment-only, no
stated fact changed; due at close-out over the full span) · `riviera-java-conventions` §6d
(the rule being enforced; read before every backend batch) · `frontend/.claude/CLAUDE.md`
(the TSDoc twin — auto-loads; the authority for Phase A) · `riviera-frontend` (N/A — no file
created, moved, or placed; comment bytes only) · `riviera-local-debug` (due before any local
`npm`/`gradlew` run; batch 1 needed none — the gates are plain `node`, CI owns the suites).

## The decision this plan records (R-3 of the issue)

Closing `wontfix` under #544's A-5 was considered and rejected: A-5's decay rate is the
**edit rate**, and 494 of the 682 affected files carry exactly one ref — the profile of leaf
specs and models that may not be edited for another reason for years. Under A-5 the tree
stays ~65 % violating indefinitely, in exactly the files new work copies from. The churn is
paid deliberately, re-priced by the probe from ~68 PRs to ~20–25.

## Acceptance criteria (testable)

Written against the pass's own boundary — the comment layer — since there is no application
behavior in scope; the pins are the gates, per the #544 precedent.

- [ ] **AC-1** Given a swept tree, when the doc-comment locator runs over `git ls-files`,
      then it reports zero 3–4-digit `#nnn` refs in doc comments. *Pinned by:* the locator
      (doc-comment-aware — **never raw grep**: refs in code strings such as `describe()`
      titles are out of a comment-only pass's reach and must not count). Reported per phase.
- [ ] **AC-2** Given a committed batch, when `node scripts/check-comment-only.mjs origin/main`
      runs, then every touched source file is code-identical after comment stripping (exit 0).
      Run **after committing** — the gate reads the committed diff and passes vacuously before.
- [ ] **AC-3** Given a committed batch, when permitted-reference patterns (`invariant #1`–`#13`,
      `D-8`, `RV-BE-*`/`RV-FE-*`, `ADR-nnnn`, Flyway `Vnn`, `{@link Type#member}`) are counted
      on the removed vs added diff lines, then none is lost. *Pinned by:* the per-batch
      before/after diff-line count (batch 1: one `ADR-0013` line touched, survives).
- [ ] **AC-4** Given a deleted or rewritten ref, when the batch is reviewed, then no sentence
      is left broken and no orphan label (`A7`, `S6`, `epic`, `review F3`) is left dangling —
      review-checked; no gate can see it.
- [ ] **AC-5** Given a committed batch, when `check-inline-comments.mjs`'s `check(['origin/main...HEAD'])`
      is called directly (the CLI no-ops on Windows), then it returns no violations **and**
      demonstrably scanned a non-zero file count.
- [ ] **AC-6** Full CI green per batch PR; the Sonar **new-issue list** is read, not the gate
      badge; every `/code-review` lens is confirmed to have actually reported.

## Non-goals

- **Reopening #544's volume sweep.** Its stop stands; over-budget blocks are not a backlog.
- **Machine-enforcing the ban** — §6d stays a review item (the gate would fight `{@link}` and
  invariant refs).
- **Any code change.** Refs inside code — string literals, `describe()` titles
  (`admin-operators.spec.ts:280` is the known instance) — are explicitly out of scope and
  survive the pass; noted here so AC-1's "zero" is measured by the locator, not by grep.
- **Backend `#`/SQL `--` comment syntaxes** — out of scope by the #522/F-6 precedent.

## Behavior-parity ledger

N/A — comment-only; no surface retired or replaced, proved per batch by AC-2.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A regex auto-fix mangles prose (`"#252, review F3"` → dangling `, review F3`); AC-2 would certify it as clean | high if scripted | med | the locator only *locates*; every edit is by hand. Batch 1 held to this: 28 hand edits, zero auto-fix | agent | standing rule |
| R-2 | Over-stripping permitted refs (`invariant #11`, `{@link Foo#bar}`) | low | med | only 3–4-digit `#nnn` matched; AC-3 counts per batch | agent | standing rule |
| R-3 | Churn across ~680 files, zero volume win | — | — | **resolved: go**, maintainer green-light 2026-08-07; rationale in *The decision this plan records* | maintainer | closed |
| R-4 | A ref is the sole pointer to load-bearing rationale and deletion loses it (#544's R-7/R-9, hit three times there) | low (FE), unknown (BE) | high | relocate before deleting, read the target for the **specific claim**; probe measured **0/83** such refs in `admin/`, but that is one homogeneous directory — B and C each get a 5-file mini-probe before their batch sizes are trusted | agent | open |
| R-5 | The pass spans many sessions/PRs and loses its place | high | med | this doc is the rule-11 state store; ledger updated per batch in the same commit window | agent | standing rule |
| R-6 | Gates pass vacuously when run before committing (both select files from the committed diff) | med | high | commit first, then gate — written into AC-2/AC-5 themselves | agent | standing rule |
| R-7 | `origin/main` stale in a fresh container → inertness check diffs a 20-commit span | med | low | `git fetch origin main` before the first gate of every session | agent | standing rule |

## Open questions / Assumptions

- **A-1 (from probe):** orphan labels are provenance too — a parenthetical's label dies with
  its ref, and an *embedded* label (`"A7 deliberately returns no owner"`) is rewritten to a
  real noun, though the letter of AC-1 does not ban a bare label. — *Owner:* agent ·
  *standing rule for all batches*
- **A-2 (inherited from #544):** backend-test doc blocks keep their "why this test exists"
  sentence; only the ref goes. — *applies to Phase B*
- **A-3:** recurring idioms get their rewrite formula settled **once** and reused
  (`the recurring #148/#351/#462/#505 stranded-focus class` → "the recurring stranded-focus
  class" covered ~48 % of the probe's embedded refs; expect backend siblings like
  "the #454 contract"). New idioms append to the Generalization-audit log. — *standing rule*
- **Open question:** do Phases B/C hold the probe's finding that no ref is a sole rationale
  pointer (R-4)? — *Owner:* agent · *Resolves by:* a 5-file mini-probe at the start of each
  phase, recorded here.

## Availability & concurrency (invariant #2)

N/A — does not affect availability: no SQL, no transaction, no claim-path change;
comment-only by construction, proved per batch by AC-2.

## Spring Modulith — modules, interfaces, events

N/A for structure — no class moves, no published surface, no event, no dependency change;
`ModularityTests`/`PackageShapeArchitectureTests` unaffected. Phases B/C touch backend
*comment bytes* only. Module ownership: no behavior added or moved — no table due.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. Backend batches touching `payment`/`payout` files change comment
bytes only (AC-2), and metric-name strings are code, untouchable by construction.

## Angular — frontend surfaces touched

TSDoc and HTML comments only; no component, template, route, or service behavior. No new
surfaces — no table due. The one frontend standard engaged is the comments section of
`frontend/.claude/CLAUDE.md` (the §6d twin), which this pass enforces.

## FE↔BE contract

N/A — no contract change.

## Batching (re-scoped from the probe — supersedes the issue's flat ~10 files/PR)

The probe showed the binding cost is **per-PR process** (CI, review, Sonar), not per-file
editing, and per-file cost follows ref density:

- **Dense files (≥4 refs, ~60 tree-wide):** judgment batches of ~10 files per PR, grouped by
  directory. The probe (10 densest `admin/` files, 83 refs, 65 embedded) is the shape.
- **Sparse tail (1–3 refs; 494 files carry exactly one):** directory sweeps of ~30 files per
  PR — a diff of thirty one-line parenthetical deletions with an inertness proof is more
  reviewable than most 10-file batches.
- **Phase order:** A `frontend/src` + `frontend/e2e` → B backend test (A-2 applies) → C
  backend main. B and C each open with a 5-file mini-probe for the R-4 rate before their
  batch sizes are trusted.
- Never heaviest-first across directories — the density ranking is only used *within* the
  dense/sparse split.

Post-probe queue, Phase A (locator census after batch 1): **481 refs across 176 files** in
`frontend/src`; `frontend/e2e` pending census. Regenerate the census per batch — it goes
stale as batches land.

## Execution status

**Stage pointer:** implement — Phase A, batch 2 at the PR gate (batch 1 merged via PR #551).

**Next action:** open the batch-2 PR, run the review gate + read the Sonar new-issue list; on
merge, restart the branch from `main` and cut batch A-3 (next dense files by the regenerated
census: `app.ts`/`app.html`, `admin/` services + tabs, `booking-pay.ts`, `home.ts`).

| Phase / batch | Scope | Ships in | Status |
|---|---|---|---|
| A-1 (probe) | 10 densest `app/admin/` files — 83 refs (65 embedded, 18 parenthetical); + the #549 ledger-row fix in the #544 plan doc | **merged via PR #551** | ✅ all gates green; review found F-3–F-5, fixed |
| A-2 | next 10 dense files — `operator-console.service`, `customer-auth`, `my-bookings`, `venue-tab`, `venue-views`, `venue-map`, `operator-auth`, `session-auth`, `operator-console`, `daily-view-tab` — 117 refs (35 embedded); F-4 whole-file label sweep applied (review F1/F2/O1/S9-R-1 orphans cleaned, one 2-line inline comment promoted to a doc comment); `design D-1`/`D-6` preserved per F-3; one stale D-6 claim corrected in passing (F-6) | this PR | ⏳ at gates |
| A-3… | remaining `frontend/src` dense files (≥4 refs), by directory | follow-up PRs | |
| A-n | sparse tail, ~30-file directory sweeps; then `frontend/e2e` | follow-up PRs | |
| B-0 | 5-file backend-test mini-probe (R-4 rate) | | |
| B-1… | backend test, per the mini-probe's verdict | | |
| C-0 | 5-file backend-main mini-probe (R-4 rate) | | |
| C-1… | backend main | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source | Finding | Status |
|---|---|---|---|
| F-1 | probe | refs live in code strings too (`describe()` titles) — a comment-only pass cannot reach them; AC-1 must be locator-measured | recorded as a Non-goal |
| F-2 | probe | orphan labels ride with refs; deleting the ref and keeping the label leaves residue | standing rule A-1 |
| F-3 | review (2 lenses converged) | `design D-5` stripped from `admin-operators.ts` — a durable decision label in the permitted D-* class, not issue provenance; target verified (`docs/architecture/auth-signin-register.md` D-5 = self-register + admin approval) | fixed — restored as `(design D-5)`; **rule for later batches: D-\* decision labels are permitted alongside D-8** |
| F-4 | review | two bare embedded `A7` labels survived in the commissions pair (`admin-commissions.ts` saveRate doc, `.spec.ts` inline) — the A-1 rule missed sites below the class doc | fixed — rewritten to "the backend"; **rule: sweep the whole file for labels, not just lines the locator flagged** |
| F-5 | review | a rewrap left `schedule. A` orphaned on its own line — gates prove inertness, not readability (this pass's R-1, exactly as pre-registered) | fixed — reflowed |
| F-6 | batch A-2 | `my-bookings.ts` claimed guest-booking back-linking "is a later, #113-gated step" — stale against the amended D-6, which makes it a **permanent non-goal**; the strip pass rewrote the sentence to the current truth rather than preserve a falsehood | fixed in A-2 — **rule: when a ref-bearing sentence states a superseded fact, correct it, don't launder it** |

## File structure

Comment-only edits across the source trees; globs stand in for the mechanical sweep, as the
#533 guard sanctions.

- `docs/plans/issue-550-issue-ref-strip.md` — **new**: this doc
- `docs/plans/comment-volume-trim.md` — **modified**: phase-4 ledger row corrected (`#549`,
  96 lines) — it contradicted its own batch header three lines below
- `frontend/src/` — **modified**: TSDoc/HTML-comment refs stripped (Phase A)
- `frontend/e2e/` — **modified**: same (Phase A tail)
- `platform/src/test/` — **modified**: same (Phase B)
- `platform/src/main/` — **modified**: same (Phase C)

## Generalization-audit log

| Date | Trigger | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-07 | probe batch A-1 | the recurring stranded-focus idiom `#148/#351/#462(/#505) …class` | locator over `frontend/src` | 9 sites in the probe's 10 files (~31 of 65 embedded refs) | formula settled once: "the recurring stranded-focus class"; reused at every site |

## Acceptance-criteria verification (final)

Per batch, in order: commit → AC-2 → AC-5 (direct `check()`, assert file count) → AC-3 count
→ push → PR → AC-6 (CI + Sonar new-issue list + all review lenses reported) → AC-4 at review.
AC-1 re-census per phase close. Batch A-1: AC-2 ✅ (10 files code-identical), AC-3 ✅
(one `ADR-0013` line survives; the stripped `design D-5` was a miss, caught at review and
restored — F-3), AC-5 ✅ (10 files scanned, 0 violations), AC-4 ✅ (review ran on PR #551,
all 5 lenses reported, findings F-3–F-5 fixed), AC-6 ✅ (CI green on `2f51e3b`; Sonar: 0 new
issues on the list, 0 duplication, 0 hotspots — no coverable new lines, comment-only).

## Self-review checklist (before merge / PR)

- [x] Every AC has a verifying gate or a named review owner (AC-4 is review-owned by design).
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Invariants #1–#13: N/A — comment-only, proved by AC-2 per batch (no code, schema, money,
      or timezone surface exists in this diff to violate them).
- [x] Frontend standards: no component behavior touched; the engaged standard is the TSDoc twin.
- [x] Execution status at HEAD matches reality.
- [ ] Risk register: R-4 stays open until the B/C mini-probes report; every other row standing
      or closed.
- [ ] The review gate ran in full (per batch — due at each PR).
