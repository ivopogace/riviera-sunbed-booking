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
- **Refs in trailing comments on code-bearing lines** (F-8): editing the comment flags the host
  line as Sonar "new code" and fails coverage on uncovered branches, on a diff AC-2 proves inert.
  30 refs / 9 files tree-wide stay, and decay under A-5 when their code is genuinely edited.
- **Spec/sibling files keep their slice labels until their own batch** — batching by file means a
  component can lose its `O5`/`O8` self-label while its `.spec.ts` twins still use it; transient
  drift, resolved when the spec batch lands, not a defect.

## Behavior-parity ledger

N/A — comment-only; no surface retired or replaced, proved per batch by AC-2.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A regex auto-fix mangles prose (`"#252, review F3"` → dangling `, review F3`); AC-2 would certify it as clean | high if scripted | med | the locator only *locates*; every edit is by hand. Batch 1 held to this: 28 hand edits, zero auto-fix | agent | standing rule |
| R-2 | Over-stripping permitted refs (`invariant #11`, `{@link Foo#bar}`) | low | med | only 3–4-digit `#nnn` matched; AC-3 counts per batch | agent | standing rule |
| R-3 | Churn across ~680 files, zero volume win | — | — | **resolved: go**, maintainer green-light 2026-08-07; rationale in *The decision this plan records* | maintainer | closed |
| R-4 | A ref is the sole pointer to load-bearing rationale and deletion loses it (#544's R-7/R-9, hit three times there) | low (FE), unknown (BE) | high | relocate before deleting, read the target for the **specific claim**; probe measured **0/83** such refs in `admin/`, but that is one homogeneous directory — B and C each get a 5-file mini-probe before their batch sizes are trusted | agent | closed — Phase A hit zero sole-rationale refs across all nine batches; B/C do not proceed (maintainer decision), so the mini-probes fire only on revival |
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
- **Open question (resolved as moot, 2026-08-08):** do Phases B/C hold the probe's finding that
  no ref is a sole rationale pointer (R-4)? — B/C do not proceed by maintainer decision, so the
  question never needs an answer under this plan; a future revival answers it with the B-0/C-0
  mini-probes before trusting any batch size. Phase A's own answer: zero sole-rationale refs in
  ~300 files.

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

**Stage pointer:** ✅ **COMPLETE — the pass is closed.** Phase A (the entire `frontend/` tree)
shipped in nine batches, PR #551–#559, plus the close-out sweep commit; the final AC-1 census is
clean (3 documented domain-vocabulary leaves, nothing else). **Maintainer decision (2026-08-08):
Phases B/C do not proceed** — the backend decays under A-5 (§6d governs each file as it is edited
for other reasons), and any future revival starts from the B-0/C-0 mini-probes, not from this
plan's batch sizes. This doc is now a historical record.

**Next action:** none — issue #550 closed with the Phase A summary.

| Phase / batch | Scope | Ships in | Status |
|---|---|---|---|
| A-1 (probe) | 10 densest `app/admin/` files — 83 refs (65 embedded, 18 parenthetical); + the #549 ledger-row fix in the #544 plan doc | **merged via PR #551** | ✅ all gates green; review found F-3–F-5, fixed |
| A-2 | next 10 dense files — `operator-console.service`, `customer-auth`, `my-bookings`, `venue-tab`, `venue-views`, `venue-map`, `operator-auth`, `session-auth`, `operator-console`, `daily-view-tab` — ~143 numeric refs removed (the locator census's "117" was doc-comment refs only; inline-comment refs and ~60 provenance labels came out too), minus 10 refs restored by the F-8 carve-out; F-4 whole-file label sweep applied (review F1/F2/O1/S9-R-1 orphans cleaned, one 3-line inline comment promoted to a doc comment); `design D-1`/`D-6` preserved per F-3; stale claims corrected per F-6 (D-6 back-linking; the retired venue-editor/staff-view surface lists) | **merged via PR #552** | ✅ all gates green (CI + Sonar on `a16a603`); minted F-7–F-9 |
| A-3 | next 10 dense files — `app.ts`, `app.html`, `admin-venue-photos.service`, `console-stats-strip`, `pricing-tab`, `home`, `admin-console-tabs`, `admin-operators.service`, `booking-pay`, `device-local-bookings` — 101 refs + labels removed (80 numeric + 21 labels; review-measured, correcting the eyeballed "~70") under the full F-3–F-9 rule set from the start: 5 F-8 trailing-on-code refs left in `pricing-tab` by design, two 2-line inline comments compressed to one line (`pricing-tab`), two 2-line HTML comments compressed (`app.html`), `Sonar S2871` recognised as a rule id (not provenance), bare `U1`/`A6`/`Q1` labels rewritten or dropped | **merged via PR #553** | ✅ all gates green; Sonar first-try |
| A-4 | next 10 dense files — `layout-editor`, `admin-outbox-lever`, `set-password`, `booking.model`, `booking.service`, `payouts-tab`, `requests-tab`, `glass-tokens`, `admin-audit.spec`, `admin-privacy.service` — ~89 refs + labels removed (72 numeric + ~17 labels incl. `O3`/`O6`/`O7`/`S4`/`S8`; review-measured, correcting the eyeballed "~60"); 17 F-8 trailing-on-code refs left by design (`layout-editor` 7, `payouts-tab` 5, `requests-tab` 5); one 4-line inline comment promoted to a method doc (`layout-editor.loadExisting`), three 2-line inline comments compressed; embedded `O1`/`O4`/`U3`/`U4 #8`/`U6`/`S3` labels rewritten to real nouns; review caught four more label sites the sweep missed (`payouts-tab` `O1`/`O7`, `glass-tokens` `T1/T2/T3–T5/epic`, a `plan Resolved`/`R-2` pointer pair) plus bare invariant shorthands normalized to `invariant #n` — all fixed | **merged via PR #554** | ✅ all gates green |
| A-5 | the last dense band — all 13 files at 4 refs: `app.spec`, `sso-buttons`, `booking-view.contrast.spec`, `booking-view`, `operator-console.html`, `operator-console.service.spec`, `operator-console.spec`, `venue-create-card`, `venue-photo.service`, `home.contrast.spec`, `availability-grid`, `parent-venue-id`, `status-chip` — ~80 refs + labels removed. Spec-heavy: ~25 refs sit in `describe`/`it` **title strings** (code, F-1 — untouched). One 4-line inline comment promoted to a const doc (`CTA_STOPS`); multi-line inline/HTML comments compressed to one line; **F-11 minted**: two multi-line inline comments in `home.contrast.spec` are protected measurement records (the scrim-curve history) — their refs stay, since compressing loses the measurements and in-place edits trip the inline guard | **merged via PR #555** | ✅ all gates green |
| A-6 | the first sparse-tail directory sweep — `app/operator/`, 44 of its 69 files edited (~121 markers removed: 85 banned numeric refs + ~35 O-labels — the review-measured figures, correcting the eyeballed "~90"; the untouched 25 were zero-ref or title-string-only). Executed by three parallel editing agents on disjoint partitions under the full F-3–F-11 brief, then orchestrator-verified. The post-merge review found six residues — the `.scss` header ref (F-12's blind spot), two `(S9)` orphans in the `operator-chrome` pair, a bare `(#9)`, one lost "(never a silent discard)" clause (cross-partition drift), and one lost "Saved notice" clause — all fixed in the A-7 PR | **merged via PR #556** | ✅ gates green; Sonar first-try; residues fixed forward |
| A-7 | `shared/` (26 files, ~48 refs) + `booking/` (28 files, ~70 markers — review-measured, correcting the eyeballed "~51"; incl. the `.scss` block comments F-12 exposed) by two editing agents, orchestrator-verified with the F-12-hardened scan (`/* */` blocks included, cross-partition idiom check); carries the six A-6 post-merge review fixes. F-6/F-7 applied: `booking-status.ts`'s union history rewritten to present tense, three completed-work history sentences deleted, `failure-panel.ts`'s 9-line inline header promoted to TSDoc | **merged via PR #557** | ✅ all gates green |
| A-8 | the last five feature directories — `admin/` (23 files), `auth/` (12), `pages/` (12), `core/` (10), `venue/` (6): 63 files, ~196 markers removed (120 banned `#` refs + 76 standalone bare labels — review-measured; the raw label-token count is 104, of which 28 are fused to an already-counted `#`-ref like `S9 #277`; none re-added). Three parallel editing agents on disjoint partitions (admin ∥ auth+pages ∥ core+venue), orchestrator-verified with the F-12-hardened scan (`.scss` + HTML block comments, bare-label sweep — which caught one missed `R-12:` in `auth-page.spec.ts`, fixed by hand). F-11 honoured: the two protected measurement records in `home.contrast.spec.ts` keep their refs. F-6 corrections: `sign-out-notice.ts` dropped the retired venue editor from its surface list; `auth.scss`'s header now names its real consumer set (the recovery/verify/set-password + operator password-change pages, not just customer sign-in/register). Beach-map seat codes (`A1`, `B7` in `venue-map.*`) recognized as domain vocabulary, not labels — left. Review pass fixed forward: four residual `slice`/`issue` orphan nouns (A-1 class — two in files the diff hadn't touched), three wording touch-ups (`theme.ts` dangling "closed", `admin-console-stats.ts` noun pileup, `home.html`'s dropped "the heading carries the meaning" clause), and one F-8 spec-file trailing-comment edit kept under the refinement recorded at F-8 | **merged via PR #558** | ✅ all gates green |
| A-9 | the final sweep — the census re-scoped it well past the estimate: 65 source files, ~249 `#`-ref tokens + ~200 label tokens net removed (review-measured: 204 raw, 4 re-added on the rewritten seat-code fixture line). Three partitions: the `src/` roots hand-edited by the orchestrator per the mandate (`app.routes.ts` 34 comment sites incl. two header blocks promoted to TSDoc; `app.*` siblings, `testing/`, `environments/`, `styles.scss` — whose card-surfaces block became a `/** */` doc comment to clear the guard, `test-setup.ts`), plus two e2e agents (a–l ∥ m–z + `support/` + `real-backend/`). New domain-vocabulary classes recognized and left: mock-seeded booking ids `#5/#7/#9/#11` in `operator-payouts.e2e.ts` (fixture data, not issue refs) and seat codes `A1`–`A4` in `operator-daily.e2e.ts`. F-6 fold-in: the routes-file `legacySurface` header now records that no production route carries the flag. Review pass caught 10 refs the orchestrator census missed — all-numeric 3-digit refs (`#109`, `#134`, `#135`, `#142`, `#148`, `#149`, `#351`) eaten by the census's 3-digit-hex filter (minted F-13) — fixed in `app.config.ts`, `app.scss`, `styles.scss` (the two block-start sites converted to `/** */` docs). Post-fix census with the hex blind spot closed: exactly 3 residues, the documented leaves (`operator-daily.e2e.ts:15` seat codes; `operator-payouts.e2e.ts:10,93` booking seeds) | **merged via PR #559** | ✅ all gates green |
| Close-out | the final AC-1 census over the **whole** `frontend/` Phase A scope (src + e2e, F-13-corrected scanner) surfaced 16 label residues that had survived the A-6/A-7 sweeps and their reviews (`AC-n`/`R-n`/`F-7` labels and orphan "slice" nouns in `operator/` + `shared/`, plus one spec-file trailing `(#224)` newly in scope under the A-8 F-8 refinement) — all fixed in the close-out commit. Post-fix census residue: **the 3 documented domain-vocabulary leaves and nothing else**; every other hit class is permitted (F-1 titles, `invariant #n` incl. wrapped continuations, F-8 non-spec trailing comments, F-11 records, hex/entities). `riviera-docs-freshness` over PR #551–#559: one finding, patched (`comment-volume-trim.md` stage line now records the #550 outcome; pre-#550 frontend figures labelled as historical) | close-out commit | ✅ |
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
| F-6 | batch A-2 | `my-bookings.ts` claimed guest-booking back-linking "is a later, #113-gated step" — stale against the amended D-6, which makes it a **permanent non-goal**; the strip pass rewrote the sentence to the current truth rather than preserve a falsehood. Review then found the same class twice more in `operator-auth.ts` (retired venue-editor/staff-view pages still named as consumers — one site untouched by the diff), both corrected | fixed in A-2 — **rule: when a ref-bearing sentence states a superseded fact, correct it, don't launder it** |
| F-7 | review (3 lenses converged) | `daily-view-tab.ts` dropped "and the legacy-page retirement" from its out-of-scope sentence — flagged as content loss. **Ruled: the deletion stands.** The retirement is since-completed work (CLAUDE.md: StaffDaily retired), so "out of scope" about it is pure decision history, which §6d deletes; F-6's correct-don't-launder applies only to claims still **operative** | no change — **rule: an out-of-scope claim about since-completed work is history (delete); an operative claim gone stale is corrected (F-6)** |
| F-8 | Sonar gate (PR #552 red) | **Editing a trailing comment on a code-bearing line makes Sonar count that line as "new code"** — 10 such lines (8 `venue-tab.ts`, 2 `daily-view-tab.ts`, all `return;`-class), 8 uncovered → coverage gate failed at 20 % on a provably code-inert diff | fixed — edits reverted; **rule: refs in trailing comments on code-bearing lines are OUT OF SCOPE for this pass** (30 refs / 9 files tree-wide; the one class A-5 decay genuinely handles, since the line is edited whenever its code is). **Refinement (A-8):** the rule protects the Sonar coverage gate, and `sonar.exclusions=**/*.spec.ts` (sonar-project.properties) keeps spec files out of analysis entirely — so trailing-comment edits on code-bearing lines **in `.spec.ts` files are safe and in scope** (confirmed empirically: PR #558 edited one such line in `home.contrast.spec.ts` and the gate passed with 0 new lines to cover). Non-spec files: the rule stands unchanged |
| F-9 | review | four 2-digit issue refs (`#97` ×3, `issue #98`) survived — the locator's 3–4-digit pattern exists to spare `invariant #1`–`#13`, but §6d bans **all** issue numbers, and 2-digit issues are real (`#97` error contract, `#98` Request-to-Book) | fixed (3 doc-comment strips + one 2-line inline compressed) — **rule: the locator must match `#14`–`#9999` context-aware (exclude `invariant #n`), not skip 2-digit refs** |
| F-10 | review ×2 (A-3, A-4) | the ledger's merged-row flip trails one batch behind — batch N's PR updates the stage pointer but leaves batch N−1's row at "⏳ at gates", so the doc self-contradicts until the next review catches it | fixed both times — **rule: when writing batch N's ledger row, flip batch N−1's row to "merged via PR #NNN ✅" in the same edit** |
| F-11 | batch A-5 | two multi-line inline comments in `home.contrast.spec.ts` carry refs inside **protected measurement records** (the photo-scrim curve history: 0.35→0.5→0.68 with the reasons) — compressing to one line loses the measurements, and editing a line inside a pre-existing multi-line inline comment trips the RV-STYLE-1 guard | left as-is — **rule: a ref inside a pre-existing multi-line inline comment whose content is a measurement record stays; the record outranks the ref** |
| F-12 | A-6 post-merge review | the census locator reads `/**` doc blocks and `//`/`<!-- -->` comments but is blind to plain `/* */` block comments — `operator-console.scss:1` kept `(issue #170, epic #141)` through a "whole-directory" sweep | fixed forward in A-7 — **rule: directory sweeps must also grep `/* */` block comments (`.scss` especially), and multi-agent batches need a cross-partition idiom check before commit** |
| F-13 | A-9 review | the census's hex-color exclusion (`#[0-9a-fA-F]{3}`) silently ate every **all-numeric 3-digit issue ref** (`#109`, `#134`, `#148`, …) — 10 refs in `app.config.ts`/`app.scss`/`styles.scss` survived a "clean" census; AC-3 does permit all-numeric 3-digit **colors** (`#333`), so the token classes genuinely collide | fixed in the A-9 review round — **rule: a census may strip only 6-digit hex; 3-digit `#nnn` tokens are refs until a human reads the context and says color** |

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

**Phase A final (batches A-2…A-9 + close-out):** the per-batch pattern held for all nine PRs —
AC-2 (comment-only) and AC-5 (inline guard, non-vacuous scan asserted) green on every merged
commit; AC-3 balance 1:1 per batch with zero net loss of permitted refs across the phase; AC-4
review ran per PR with every lens explicitly reported (its catches are the F-3…F-13 register);
AC-6 CI green + the Sonar new-issue **list** (via API, not the badge) empty on every merge —
first-try green from A-3 onward. **AC-1 (phase close): the whole-scope census over
`frontend/src` + `frontend/e2e` with the F-13-corrected scanner returns exactly the 3 documented
domain-vocabulary leaves** (`operator-daily.e2e.ts:15`, `operator-payouts.e2e.ts:10,93`); every
other remaining `#`/label token is a permitted class (F-1 title strings, `invariant #n` and
wrapped continuations, F-8 non-spec trailing comments, F-11 measurement records, hex colors,
HTML entities, `design D-n`/`§n.n`, RFC numbers).

## Self-review checklist (before merge / PR)

- [x] Every AC has a verifying gate or a named review owner (AC-4 is review-owned by design).
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Invariants #1–#13: N/A — comment-only, proved by AC-2 per batch (no code, schema, money,
      or timezone surface exists in this diff to violate them).
- [x] Frontend standards: no component behavior touched; the engaged standard is the TSDoc twin.
- [x] Execution status at HEAD matches reality.
- [x] Risk register: R-4 closed (Phase A: zero sole-rationale refs; B/C moot by maintainer
      decision); every other row standing-rule or closed.
- [x] The review gate ran in full — every batch PR (#551–#559) carried a full-diff review with
      all lenses reported before merge.
