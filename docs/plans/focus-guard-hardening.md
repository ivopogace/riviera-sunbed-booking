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
(ran pre-merge over `origin/main...HEAD` + the counting sweep: the "two rules / only BUSY-1
fails a build" statements in root `CLAUDE.md`, `frontend/.claude/CLAUDE.md` and the RV-FE-9
preamble in the review overlay were stale and are fixed in this PR; the per-slice history
docs keep their past-tense records, with the bank-item's F-8 row annotated to its resolution) ·
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

- [x] **AC-1 (#629.1):** Given a component whose signal-flipping handler is the **first** class
  member (or is preceded only by a decorator line), when that handler also moves focus, then
  FOCUS-1 reports nothing — member order does not change the verdict. *Pinned by:*
  `check-focus-posture.test.mjs` › `judges a first-member handler by its own body, not the class's`
- [x] **AC-2 (#629.2):** Given two `@if` blocks that open and close on one line where the
  **first** renders a focus trap, then the trap is attributed to the first block's gating
  signal and the sibling's signal is not reported. *Pinned by:*
  `attributes a trap to the block that renders it when two share a line`
- [x] **AC-3 (#629.3):** Given branch-body prose containing an apostrophe (`<p>It's ready</p>`),
  then the branch closes at its real `}` and a trap rendered after the branch is not attributed
  to it. *Pinned by:* `does not let a prose apostrophe extend a branch to the end of file`
- [x] **AC-4 (#629.4):** Given a diff whose added lines make the component floor land on the
  **negated** trigger half while the same signal's flip is also added, then exactly one FOCUS-1
  is reported for that signal (the one-finding-per-signal-per-file contract). *Pinned by:*
  `reports a surface once when the floor lands on the negated trigger`
- [x] **AC-5 (#629.5):** Given the test suite is run from outside the repository
  (`cd /tmp && node --test …/check-focus-posture.test.mjs`), then every test passes —
  `findViolations` calls no git and reads no live tree unless explicitly told to. *Pinned by:*
  the whole suite run from `/tmp` (the three previously-impure tests now inject `isFocusTrap`).
- [x] **AC-6 (#628):** Given a diff adds a text-like `<input>` (literal `type` in the readonly
  set, or no `type`) or `<textarea>` whose **own start tag** carries a commit handler
  (`(change)`/`(blur)` — **not** `(input)`, see the audit log) and a `[disabled]` bound to a
  `BUSY_STEMS` flag, then
  **BUSY-2** is reported and **fails the build**; a `<select>`/checkbox/radio/`file`/`range`/
  `color`, a dynamic `[type]`, a handler-less field, a draft-sync `(input)`-only field, or a
  validity-bound `[disabled]` reports
  nothing. *Pinned by:* the `BUSY-2` test group (flags/spares/draft-sync cases).
- [x] **AC-7 (#628):** Given the standing tree, when `node scripts/check-focus-posture.mjs --all`
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
| R-1 | BUSY-2 false positive fails a build on correct code (the one error direction this layer cannot afford) | low | high | allow-list of the readonly-applicable types only; skip on dynamic `[type]`; AC-7's zero-violation `--all` sweep before the rule gates | session | closed — the sweep did its job: 3 draft-sync false positives with `(input)` in scope → `(input)` removed, re-swept 0 (see audit log + Resolved assumption) |
| R-2 | Reordering `declaresClass` misreads a real class-body brace as a member (false negative direction) | low | med | the existing heritage-overflow test stays green; A/B member-order tests added both ways | session | closed — heritage-overflow test green beside the three new member-order pins (4a2b337) |
| R-3 | `closingBrace` quote fix breaks the quoted-brace-in-interpolation case it exists for | low | med | existing test `reads past a brace quoted inside the branch body` stays green; new prose-apostrophe test beside it | session | closed — `reads past a brace quoted inside the branch body` green beside the prose-apostrophe pin (4a2b337) |
| R-4 | Doc twins drift: root `CLAUDE.md` and `frontend/.claude/CLAUDE.md` state "only BUSY-1 fails a build" | certain (without action) | med | both updated in this PR; `riviera-docs-freshness` pass at close-out | session | closed — both CLAUDE.md twins updated (1bb93b4); the freshness counting sweep also caught the overlay preamble's "two rules", fixed in the close-out commit |
| R-5 | The three impure tests keep passing in-repo, hiding the purity regression from CI | med | low | AC-5 is verified from `/tmp`, not from the repo root | session | closed — 53/53 from `/tmp` at 1bb93b4 |

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

**Stage pointer:** review gate — findings fixed, awaiting final CI + merge

**Next action:** confirm CI + Sonar green on the review-fix push, then merge PR #630
(`merged via PR #630`); issues #628/#629 auto-close via the PR.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan doc | ✅ | 4857d27 |
| 1 — #629 parser fixes 1–4 (declaresClass, one-line siblings, apostrophe, negated-floor dedup) | ✅ | 4a2b337 |
| 2 — #629 hygiene (test purity AC-5, header count, advice wording + twin, ls-files dedupe, RegExp.escape, memberOf early-exit, lazy sibling reads) | ✅ | 2674c48 |
| 3 — #628 BUSY-2 rule + doc twins + AC-7 sweep | ✅ | 1bb93b4 |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review gate (`/code-review`, PR #630) | BUSY-2 skipped only `[type]`, so a dynamic `[attr.type]` field gate-failed even when the runtime kind is readonly-inert | fixed — `[attr.type]` joins the escape hatch, pinned in the spares matrix (review-fix commit) |
| F-2 | review gate (`/code-review`, PR #630) | the reordered `declaresClass` misread `extends mixin({ … }) {` — the class body became a member, and any focus call in the class exempted every stranding flip (false-negative regression vs `origin/main`) | fixed — `declaresClass` is a brace-aware backward walk to the `class` keyword, pinned by `does not classify a heritage call argument closing line as a member` (review-fix commit) |
| F-3 | review gate (`/code-review`, PR #630) | two prose apostrophes straddling a branch's `}` still read as a string, re-opening the #629.3 misattribution (advisory impact) | fixed — a single quote opens a string only in expression context (interpolation / unclosed parens), pinned by the straddling-pair and condition-quoted-brace tests (review-fix commit) |
| F-4 | review gate (`/code-review`, PR #630) | the plan's Phase 3 step still said `(change)/(blur)/(input)`, contradicting AC-6 and `COMMIT_HANDLERS` | fixed — step reworded to match the shipped scope (review-fix commit) |

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

- [x] **Step 1: four failing tests** — first-member handler (AC-1 A/B), one-line sibling blocks
  (AC-2), prose apostrophe (AC-3), negated-floor dedup (AC-4).
- [x] **Step 2: run, verify each fails** — `node --test scripts/check-focus-posture.test.mjs` → 4 FAIL.
- [x] **Step 3: minimal implementations** —
  - `declaresClass`: test the statement-terminator on the lines **above** before the `\bclass\b`
    test, so a first member's own brace is never attributed to the class declaration above it.
  - `trapSurfaces`/`bodyEnd`: carry the trap's **column** and compare against column-precise
    block spans, so two blocks sharing a line attribute the trap to the one that holds it.
  - `closingBrace`: treat a quote with no closing mate on its line as literal prose, not a
    string opener (the interpolation case it exists for closes on the same line).
  - `gatingSignal`: accept an optional `!`, so a negated floor still records its signal in
    `reported`.
- [x] **Step 4: run, verify all pass** — full guard suite green.
- [x] **Step 5: generalization audit** — check the sibling guards (`check-inline-comments`,
  `check-plan-file-structure`, `check-prettier-format`) for the same quote/brace idioms; log below.
- [x] **Step 6: commit** — `Fix the four FOCUS-1 scoping defects (#629)`
- [x] **Step 7: execution status updated** in the same commit window.

## Phase 2 — #629 hygiene

**Files:** Modify `scripts/check-focus-posture.mjs`, `scripts/check-focus-posture.test.mjs`,
`frontend/.claude/CLAUDE.md`

- [x] Inject `isFocusTrap` into the three tests that reach the module singleton (the
  `app-money-input` busy test and the two `<app-confirm-panel>` delegation tests); AC-5 verified
  from `/tmp`.
- [x] Module header: "8 standing confirm surfaces" → the 11 surfaces the widened trigger judges
  (8 confirm + 3 focus-trapped modals), matching `docs/plans/focus-surface-scoping.md` AC-4.
- [x] `ADVICE['FOCUS-1']` + the `frontend/.claude/CLAUDE.md` twin: state the anchoring rule as
  implemented (first added in-file flip, else the branch when the file holds the template;
  a flip whose own handler moves focus clears the surface).
- [x] Share one `git ls-files` lister between `sweep()` and `focusTraps`' default index
  (module-level memo — one subprocess per process).
- [x] `escaped()` → `RegExp.escape` (Node 26, pinned by `.nvmrc`).
- [x] `memberOf`: stop the upward walk at the class-declaring brace instead of line 0.
- [x] `checkOne`: sibling reads become lazy — the `.html` sibling is read only when the `.ts`
  has no inline template, ending the ~300 swallowed ENOENTs per `--all`.
- [x] Commit — `Restore guard-test purity and settle the #629 hygiene list (#629)`

## Phase 3 — #628: BUSY-2

**Files:** Modify `scripts/check-focus-posture.mjs`, `scripts/check-focus-posture.test.mjs`,
`frontend/.claude/CLAUDE.md`, `CLAUDE.md`,
`.claude/skills/riviera-review-overlay/references/frontend-conventions.md`,
`docs/plans/focus-posture-bank-item.md`

- [x] **Failing tests first** (AC-6 flags/spares matrix), then the rule: in `busyViolations`,
  a non-actionable start tag is judged BUSY-2 when it is text-like (literal readonly-applicable
  `type`, or none; or `<textarea>`), carries `(change)`/`(blur)` — `(input)` excluded after the
  gating sweep, see the audit log — and binds a busy
  `[disabled]` — advice: `[readonly]` (`read-only:` variant), pointing at `pricing-tab.html`.
- [x] Add `BUSY-2` to `GATING` and to the `--all` counts line.
- [x] AC-7: `node scripts/check-focus-posture.mjs --all` → `BUSY-2: 0`.
- [x] Doc twins updated (File structure list above).
- [x] Commit — `Add BUSY-2 for the self-committing-field shape (#628)`

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-11 | Phase 1 (prose-apostrophe fix) | naive same-line quote-skipping over prose-bearing text | `grep -n "skipString" scripts/*.mjs` | `check-inline-comments.mjs` `scan()` — an HTML prose apostrophe can hide a same-line `<!--` | no fix: that guard's error direction is a **miss** (a comment goes unchecked), never a false positive, and it scans comment syntax, not block structure; out of #629's scope |
| 2026-08-11 | Phase 1 (`declaresClass` order) | walk-up classification testing a keyword before a boundary terminator | `grep -n "class\\\\b" scripts/*.mjs` | none — no other guard walks source upward | no action |
| 2026-08-11 | Phase 3 (BUSY-2 gating sweep) | every standing site the candidate rule would fail | `node scripts/check-focus-posture.mjs --all` | 3 with `(input)` in `COMMIT_HANDLERS` (`admin-commissions.ts:175,202`, `admin-privacy.ts:173`) — all draft-sync, write started by a button | narrowed the rule: `(input)` removed from `COMMIT_HANDLERS` (deliberate miss, documented in the constant's TSDoc + a pinning spare test); re-swept → 0 |

---

## Acceptance-criteria verification (final)

- [x] **AC-1..AC-4, AC-6:** `node --test scripts/check-focus-posture.test.mjs` → 56/56 pass (53 at 1bb93b4; 56 after the review-fix pins).
- [x] **AC-5:** `cd /tmp && node --test <abs path>/check-focus-posture.test.mjs` → 56/56 pass.
- [x] **AC-7:** `node scripts/check-focus-posture.mjs --all` → `BUSY-1: 0  BUSY-2: 0  FOCUS-1: 0`.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced (invariant #1) — no backend code in scope.
- [x] **Availability** section justified N/A (invariant #2).
- [x] Pool + cutoff rules not in scope (invariants #3, #4).
- [x] **Modulith** section justified N/A (invariant #11).
- [x] **Payment/payout** N/A (invariants #5, #8, #9).
- [x] Refund policy not in scope (invariant #10).
- [x] Timezone not in scope (invariant #6).
- [x] Booking codes not in scope (invariant #7).
- [x] No schema change (invariant #12).
- [x] **Frontend** standards N/A — no app-code change.
- [x] Execution status at HEAD matches reality.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR** — merged via PR #630.
- [x] **The review gate ran in full** — invocation-ladder rung 1 (`Skill("code-review")`
      succeeded; single-pass inline, declared as such in the PR) + `riviera-review-overlay`;
      4 findings, all fixed through the re-entry loop (register above), changed surface
      re-reviewed.
