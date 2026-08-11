# Focus-guard hardening: FOCUS-1 scoping fixes + the BUSY-2 self-committing-field rule (#628, #629)

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the six defect areas #629 found in `scripts/check-focus-posture.mjs` (false
positives on compliant code, a wrong-sibling attribution, a latent apostrophe bug, a
duplicate report, test-purity and doc-accuracy regressions), and add #628's rule for the
self-committing-field shape (#625's class) scoped to the controls `readonly` actually
applies to — as a gating rule named **BUSY-2**.

**Architecture:** One PR, two issues, one file family: everything lands in
`scripts/check-focus-posture.mjs` + its test file + the doc twins. The #629 fixes go first
so #628's new rule is built on a harness whose tests are pure and whose parser is trusted.
BUSY-2 takes issue #628's first option — **scope to the kinds `[readonly]` applies to and
stay silent on the rest** — the same deny-list/false-negative-safe posture and the same
zero-false-positive argument that made BUSY-1 gating; the inert kinds stay RV-FE-9's.

**Persistence:** N/A — no backend, no schema; the slice touches Node guard scripts and docs only.

**Source of intent:** GitHub issues #628 (deferred from PR #627 review finding F-8, recorded
in `docs/plans/focus-posture-bank-item.md`) and #629 (PR #627's review gate over the merged
#626 diff).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — confirmed both
issues describe HEAD `0a2fa44`, no drift; only Dependabot PRs in flight, nothing touches
`scripts/`) · `riviera-plan-doc` (this template — forced the BUSY-2 scope decision to be made
at plan time, not mid-diff) · `tdd` (each parser fix lands red-first as a named test) ·
`riviera-review-overlay` (review gate — runs at ready-for-review) · `riviera-docs-freshness`
(due at close-out over this slice's own diff: the "two rules / only BUSY-1 fails a build"
statements in root `CLAUDE.md` and `frontend/.claude/CLAUDE.md` go stale the moment BUSY-2
gates — both are updated in this PR, and the close-out pass re-checks the wider substrate) ·
No other routed row fires: no backend Java (`riviera-modulith`/`riviera-java-conventions` N/A),
no Flyway (`postgres` N/A), no file under `frontend/src` or `frontend/e2e`
(`riviera-frontend`/`angular-developer`/`playwright-cli` N/A — `frontend/.claude/CLAUDE.md` is
a doc, not app code), no money (`riviera-stripe-payments` N/A), no `./gradlew`/`npm` needed
(`riviera-local-debug` N/A — the suite runs on bare `node --test`, and the Prettier CI check
deliberately excludes `scripts/`).

**Branch:** `claude/issues-628-629-scripting-4ifazb` — the cloud session's designated remote
branch, standing in for `bugfix/focus-guard-hardening` per the riviera-sdlc remote addendum.

---

## Acceptance criteria (testable)

- [ ] **AC-1 (#629.1):** Given a component whose signal-flipping handler is the **first** class
  member (or is preceded only by a decorator line), when that handler also moves focus, then
  FOCUS-1 reports nothing — member order does not change the verdict. *Pinned by:*
  `check-focus-posture.test.mjs` › `judges a first-member handler by its own body, not the class's`
- [ ] **AC-2 (#629.2):** Given two `@if` blocks that open and close on one line where the
  **first** renders a focus trap, then the trap is attributed to the first block's gating
  signal and the sibling's signal is not reported. *Pinned by:*
  `attributes a trap to the block that renders it when two share a line`
- [ ] **AC-3 (#629.3):** Given branch-body prose containing an apostrophe (`<p>It's ready</p>`),
  then the branch closes at its real `}` and a trap rendered after the branch is not attributed
  to it. *Pinned by:* `does not let a prose apostrophe extend a branch to the end of file`
- [ ] **AC-4 (#629.4):** Given a diff whose added lines make the component floor land on the
  **negated** trigger half while the same signal's flip is also added, then exactly one FOCUS-1
  is reported for that signal (the one-finding-per-signal-per-file contract). *Pinned by:*
  `reports a surface once when the floor lands on the negated trigger`
- [ ] **AC-5 (#629.5):** Given the test suite is run from outside the repository
  (`cd /tmp && node --test …/check-focus-posture.test.mjs`), then every test passes —
  `findViolations` calls no git and reads no live tree unless explicitly told to. *Pinned by:*
  the whole suite run from `/tmp` (the three previously-impure tests now inject `isFocusTrap`).
- [ ] **AC-6 (#628):** Given a diff adds a text-like `<input>` (literal `type` in the readonly
  set, or no `type`) or `<textarea>` whose **own start tag** carries a commit handler
  (`(change)`/`(blur)` — **not** `(input)`, see the audit log) and a `[disabled]` bound to a
  `BUSY_STEMS` flag, then
  **BUSY-2** is reported and **fails the build**; a `<select>`/checkbox/radio/`file`/`range`/
  `color`, a dynamic `[type]`, a handler-less field, a draft-sync `(input)`-only field, or a
  validity-bound `[disabled]` reports
  nothing. *Pinned by:* the `BUSY-2` test group (flags/spares/draft-sync cases).
- [ ] **AC-7 (#628):** Given the standing tree, when `node scripts/check-focus-posture.mjs --all`
  sweeps it, then BUSY-2 reports **0** — the rule gates with no standing violation (the #625
  site already carries `[readonly]`; the four standing self-committing controls are inert kinds).
  *Verified by:* running `--all` and reading the counts line.

## Non-goals

- **No per-control advice strings for the inert kinds** (issue #628's second option): BUSY-2
  stays silent on controls `readonly` cannot lock — those remain RV-FE-9's human check, per the
  prose in `frontend/.claude/CLAUDE.md` ("don't lock the control itself").
- **No FOCUS-1 widening or narrowing** — #629 fixes its parser, not its predicate; the
  advisory-vs-gating split is untouched.
- **No rewrite onto a real parser** (Angular compiler / TS API) — out of scope; the regex
  scanner stays, corrected.
- **No CI wiring change** — the guard's `--diff` entry in `ci.yml` and the `PostToolUse` hook
  are unchanged; BUSY-2 rides the existing invocation.
- **No `memberOf` caching layer** — the perf item is settled by the early-exit walk, not a memo.

## Behavior-parity ledger

N/A — no surface is retired or replaced; the guard's contract is corrected and extended.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | BUSY-2 false positive fails a build on correct code (the one error direction this layer cannot afford) | low | high | allow-list of the readonly-applicable types only; skip on dynamic `[type]`; AC-7's zero-violation `--all` sweep before the rule gates | session | open |
| R-2 | Reordering `declaresClass` misreads a real class-body brace as a member (false negative direction) | low | med | the existing heritage-overflow test stays green; A/B member-order tests added both ways | session | open |
| R-3 | `closingBrace` quote fix breaks the quoted-brace-in-interpolation case it exists for | low | med | existing test `reads past a brace quoted inside the branch body` stays green; new prose-apostrophe test beside it | session | open |
| R-4 | Doc twins drift: root `CLAUDE.md` and `frontend/.claude/CLAUDE.md` state "only BUSY-1 fails a build" | certain (without action) | med | both updated in this PR; `riviera-docs-freshness` pass at close-out | session | open |
| R-5 | The three impure tests keep passing in-repo, hiding the purity regression from CI | med | low | AC-5 is verified from `/tmp`, not from the repo root | session | open |

## Open questions / Assumptions

### Resolved

- **Assumption (falsified, then resolved by narrowing):** "the sweep will be clean with
  `(change)`/`(blur)`/`(input)` as the commit handlers" — **wrong**: the gating sweep found three
  standing hits (`admin-commissions` ×2, `admin-privacy`), all `(input)`-draft-sync fields whose
  write a *button* starts — the exact "mirror case" `docs/plans/focus-posture-bank-item.md`'s
  generalization audit had already classified as correct code. `(input)` is excluded from
  `COMMIT_HANDLERS` (it is a per-keystroke event, not a commit point; #625's shape is
  `(change)`/`(blur)`, which is also what that audit grepped), pinned by
  `does not read a draft-sync input binding as self-committing`; the re-run sweep is clean.

- **BUSY-2 scope** (issue #628's open design decision): narrow — text-like kinds only, silent
  on the rest — chosen at plan time with the user's go-ahead on that recommendation;
  rationale in Architecture above. *Resolved: this plan, pre-phase-1.*

## Availability & concurrency (invariant #2)

N/A — does not affect availability; no backend, no booking/map surface, guard scripts only.

## Spring Modulith — modules, interfaces, events

N/A — frontend-tooling only; no backend code in scope.

### Module ownership (§4a)

N/A — no module behavior added or moved; the slice lives in `scripts/` and docs.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

N/A — no file under `frontend/src`; `frontend/.claude/CLAUDE.md` is guidance prose, not an
app surface.

## FE↔BE contract

N/A — no contract change.

## Execution status

> **This section is the session-recovery anchor.** Re-read it (plus the current stage's
> `riviera-sdlc` reference file) after any compaction or in a fresh session before acting.

**Stage pointer:** CI gate (draft PR #630) → ready-for-review

**Next action:** confirm CI green on the phase-3 push, then mark PR #630 ready and run the
review gate per `riviera-sdlc` `references/pr-gates.md` §1.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan doc | ✅ | 4857d27 |
| 1 — #629 parser fixes 1–4 (declaresClass, one-line siblings, apostrophe, negated-floor dedup) | ✅ | 4a2b337 |
| 2 — #629 hygiene (test purity AC-5, header count, advice wording + twin, ls-files dedupe, RegExp.escape, memberOf early-exit, lazy sibling reads) | ✅ | 2674c48 |
| 3 — #628 BUSY-2 rule + doc twins + AC-7 sweep | ✅ | (this commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `docs/plans/focus-guard-hardening.md` — this plan.
- `scripts/check-focus-posture.mjs` — all six #629 fix areas + the BUSY-2 rule, advice string,
  gating-set and `--all` counts line.
- `scripts/check-focus-posture.test.mjs` — new pins for AC-1..AC-4 and AC-6; `isFocusTrap`
  injected into the three impure tests (AC-5).
- `frontend/.claude/CLAUDE.md` — guard paragraph: BUSY-2 added, FOCUS-1 anchoring sentence
  corrected, "only BUSY-1 fails a build" updated.
- `CLAUDE.md` — the #621 CI sentence ("of its two rules only BUSY-1 fails a build") updated to
  the three-rule reality.
- `.claude/skills/riviera-review-overlay/references/frontend-conventions.md` — the #625
  blind-spot note gains "now machine-checked as BUSY-2 for the text-like kinds; the inert kinds
  remain this check's".
- `docs/plans/focus-posture-bank-item.md` — F-8's deferral record annotated with its resolution
  (BUSY-2, this PR).

---

## Phase 1 — #629 parser fixes 1–4

**Files:** Modify `scripts/check-focus-posture.mjs` · Test `scripts/check-focus-posture.test.mjs`

- [ ] **Step 1: four failing tests** — first-member handler (AC-1 A/B), one-line sibling blocks
  (AC-2), prose apostrophe (AC-3), negated-floor dedup (AC-4).
- [ ] **Step 2: run, verify each fails** — `node --test scripts/check-focus-posture.test.mjs` → 4 FAIL.
- [ ] **Step 3: minimal implementations** —
  - `declaresClass`: test the statement-terminator on the lines **above** before the `\bclass\b`
    test, so a first member's own brace is never attributed to the class declaration above it.
  - `trapSurfaces`/`bodyEnd`: carry the trap's **column** and compare against column-precise
    block spans, so two blocks sharing a line attribute the trap to the one that holds it.
  - `closingBrace`: treat a quote with no closing mate on its line as literal prose, not a
    string opener (the interpolation case it exists for closes on the same line).
  - `gatingSignal`: accept an optional `!`, so a negated floor still records its signal in
    `reported`.
- [ ] **Step 4: run, verify all pass** — full guard suite green.
- [ ] **Step 5: generalization audit** — check the sibling guards (`check-inline-comments`,
  `check-plan-file-structure`, `check-prettier-format`) for the same quote/brace idioms; log below.
- [ ] **Step 6: commit** — `Fix the four FOCUS-1 scoping defects (#629)`
- [ ] **Step 7: execution status updated** in the same commit window.

## Phase 2 — #629 hygiene

**Files:** Modify `scripts/check-focus-posture.mjs`, `scripts/check-focus-posture.test.mjs`,
`frontend/.claude/CLAUDE.md`

- [ ] Inject `isFocusTrap` into the three tests that reach the module singleton (the
  `app-money-input` busy test and the two `<app-confirm-panel>` delegation tests); AC-5 verified
  from `/tmp`.
- [ ] Module header: "8 standing confirm surfaces" → the 11 surfaces the widened trigger judges
  (8 confirm + 3 focus-trapped modals), matching `docs/plans/focus-surface-scoping.md` AC-4.
- [ ] `ADVICE['FOCUS-1']` + the `frontend/.claude/CLAUDE.md` twin: state the anchoring rule as
  implemented (first added in-file flip, else the branch when the file holds the template;
  a flip whose own handler moves focus clears the surface).
- [ ] Share one `git ls-files` lister between `sweep()` and `focusTraps`' default index
  (module-level memo — one subprocess per process).
- [ ] `escaped()` → `RegExp.escape` (Node 26, pinned by `.nvmrc`).
- [ ] `memberOf`: stop the upward walk at the class-declaring brace instead of line 0.
- [ ] `checkOne`: sibling reads become lazy — the `.html` sibling is read only when the `.ts`
  has no inline template, ending the ~300 swallowed ENOENTs per `--all`.
- [ ] Commit — `Restore guard-test purity and settle the #629 hygiene list (#629)`

## Phase 3 — #628: BUSY-2

**Files:** Modify `scripts/check-focus-posture.mjs`, `scripts/check-focus-posture.test.mjs`,
`frontend/.claude/CLAUDE.md`, `CLAUDE.md`,
`.claude/skills/riviera-review-overlay/references/frontend-conventions.md`,
`docs/plans/focus-posture-bank-item.md`

- [ ] **Failing tests first** (AC-6 flags/spares matrix), then the rule: in `busyViolations`,
  a non-actionable start tag is judged BUSY-2 when it is text-like (literal readonly-applicable
  `type`, or none; or `<textarea>`), carries `(change)`/`(blur)`/`(input)`, and binds a busy
  `[disabled]` — advice: `[readonly]` (`read-only:` variant), pointing at `pricing-tab.html`.
- [ ] Add `BUSY-2` to `GATING` and to the `--all` counts line.
- [ ] AC-7: `node scripts/check-focus-posture.mjs --all` → `BUSY-2: 0`.
- [ ] Doc twins updated (File structure list above).
- [ ] Commit — `Add BUSY-2 for the self-committing-field shape (#628)`

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-11 | Phase 1 (prose-apostrophe fix) | naive same-line quote-skipping over prose-bearing text | `grep -n "skipString" scripts/*.mjs` | `check-inline-comments.mjs` `scan()` — an HTML prose apostrophe can hide a same-line `<!--` | no fix: that guard's error direction is a **miss** (a comment goes unchecked), never a false positive, and it scans comment syntax, not block structure; out of #629's scope |
| 2026-08-11 | Phase 1 (`declaresClass` order) | walk-up classification testing a keyword before a boundary terminator | `grep -n "class\\\\b" scripts/*.mjs` | none — no other guard walks source upward | no action |
| 2026-08-11 | Phase 3 (BUSY-2 gating sweep) | every standing site the candidate rule would fail | `node scripts/check-focus-posture.mjs --all` | 3 with `(input)` in `COMMIT_HANDLERS` (`admin-commissions.ts:175,202`, `admin-privacy.ts:173`) — all draft-sync, write started by a button | narrowed the rule: `(input)` removed from `COMMIT_HANDLERS` (deliberate miss, documented in the constant's TSDoc + a pinning spare test); re-swept → 0 |

---

## Acceptance-criteria verification (final)

- [x] **AC-1..AC-4, AC-6:** `node --test scripts/check-focus-posture.test.mjs` → 53/53 pass.
- [x] **AC-5:** `cd /tmp && node --test <abs path>/check-focus-posture.test.mjs` → 53/53 pass.
- [x] **AC-7:** `node scripts/check-focus-posture.mjs --all` → `BUSY-1: 0  BUSY-2: 0  FOCUS-1: 0`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — no backend code in scope.
- [ ] **Availability** section justified N/A (invariant #2).
- [ ] Pool + cutoff rules not in scope (invariants #3, #4).
- [ ] **Modulith** section justified N/A (invariant #11).
- [ ] **Payment/payout** N/A (invariants #5, #8, #9).
- [ ] Refund policy not in scope (invariant #10).
- [ ] Timezone not in scope (invariant #6).
- [ ] Booking codes not in scope (invariant #7).
- [ ] No schema change (invariant #12).
- [ ] **Frontend** standards N/A — no app-code change.
- [ ] Execution status at HEAD matches reality.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — cite `merged via PR #NN` once the PR exists.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc
      `references/pr-gates.md` §1 plus `riviera-review-overlay`.
