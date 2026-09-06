# Shared inline-template opener (#979) Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** The decision "the template literal after `template:` in a `.ts`/`.tsx` file is an Angular
inline template, and a `${…}` inside it is code counted by brace depth" lives in one module,
`scripts/inline-template.mjs`, that the four guards import, with `scripts/inline-template.test.mjs`
pinning it — and no guard keeps a private `template\s*:\s*$` regex or brace counter.

**Architecture:** One small module beside `git-diff.mjs` (the guards' existing shared module) with
two exports: a `CodeTail` that a scanner feeds the code it walks and asks, at a backtick, whether the
literal is an inline template; and `interpolationStep`, the one step of the `${…}` brace-depth rule.
Each guard keeps its own scanner loop and its own string/comment/escape handling — those are the
scanner's general rules, not the inline-template decision — and swaps only the two duplicated pieces.

**Persistence:** JDBC only (invariant #1). No tables or migrations — the slice is Node guard scripts
and their suites.

**Source of intent:** GitHub issue #979 (deferred from the review of PR #978, issue #977).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — found that the
focus-posture and touch-target copies lack the `\b` the issue says all four share, so `xtemplate:`
opens a template in those two today; and that #977's plan doc is still in `docs/plans/`, due for
retirement at this close-out) · `grilling` (the intake interrogation, self-run: the four tails are
built differently but agree under the word-bounded regex — see Assumptions) · `riviera-plan-doc`
(this template — forced the reconciled `\b` corner to be an AC with a pin in each affected suite,
not a silent alignment) · `tdd` (the helper's suite red first; each guard swapped one at a time
with its own suite as the bar) · `codebase-design` (the seam: the guards keep their loops and hand
over only the decision — a `CodeTail` the scanner feeds, not a fifth scanner; string and comment
handling stays each scanner's own general rule) · `riviera-review-overlay` (review gate — at
ready-for-review) · `riviera-docs-freshness` (close-out — pending) · `riviera-local-debug`
(unshallowed the clone before the guards' first `--diff`; `node --test "scripts/*.test.mjs"` is
the scoped run — no Gradle, no npm install). No `postgres`, `riviera-modulith`,
`riviera-java-conventions`, `riviera-frontend` or `playwright-cli` row fires: the diff holds no SQL,
no Java, and nothing under `frontend/`.

**Branch:** `claude/sdlc-979-1xbgaa` (the cloud session's designated branch stands in for
`feature/shared-inline-template-opener`)

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a `CodeTail` fed `template: ` — or `template:` then a newline and indentation,
  or `{ template:`, or `template :` — when asked at the backtick, then it answers inline template;
  fed `xtemplate: `, `templates: `, `template: 'x' ` (a string resets the tail), or nothing, it
  answers string. A backtick consumes the tail, so the next backtick with nothing fed between them
  is a string. *Seam:* `scripts/inline-template.mjs` `CodeTail` (`push` / `reset` /
  `opensInlineTemplate`) · *Pinned by:* `inline-template.test.mjs` "the code before a backtick decides
  whether it opens an inline template" + "a backtick consumes the tail"
- [x] **AC-2:** Given template text at a position, when `interpolationStep` is asked, then `${` opens
  an interpolation at depth 1, a `{`/`}` inside one moves the depth, any other character inside one
  is consumed at the same depth, and plain template text answers null; a brace inside a string
  inside the interpolation counts too (the documented simplification). *Seam:*
  `scripts/inline-template.mjs` `interpolationStep(text, at, depth)` · *Pinned by:*
  `inline-template.test.mjs` "an interpolation is code counted by brace depth" + "a brace inside a
  string inside the interpolation counts"
- [x] **AC-3:** Given the four guards, when their sources are searched, then none holds a private
  opener regex or brace counter (`git grep -n 'template\\s\*:' scripts/check-*.mjs` → 0 hits;
  `git grep -n "=== '{'" scripts/check-*.mjs` → only the non-template counters focus-posture keeps
  for class bodies), and the four suites plus `guard-cli.test.mjs` are green unchanged. *Seam:* each
  guard's exported detector (`findViolations`, `strip`, `scan`) and CLI · *Pinned by:* the existing
  `check-*.test.mjs` suites + `guard-cli.test.mjs`
- [x] **AC-4:** Given a `.ts` file where a backtick follows `xtemplate:` and its literal holds a
  `[disabled]="busy()"` button (focus) or a bare `<button>` (touch-target), when judged, then no
  finding fires — the two guards adopt the word-bounded opener the other two already have. *Seam:*
  `check-focus-posture.mjs` `scan` and `check-touch-target.mjs` `findViolations` · *Pinned by:*
  `check-focus-posture.test.mjs` "a key that merely ends in `template` does not open an inline
  template" + `check-touch-target.test.mjs` (same name)

## Non-goals

- A fifth scanner: the guards keep their own loops, string/escape rules and comment handling. Only
  the opener decision and the interpolation step move.
- Changing what a comment between `template:` and its backtick does — three guards reset their tail
  on it, `check-comment-only` does not; no fixture in the tree has one, and it stays as it is.
- Widening the inline-template extensions past `.ts`/`.tsx`, or touching `frontend/`.
- Fixing the brace-in-string interpolation simplification: it is pinned as the documented rule.

## Behavior-parity ledger (retirement / replacement slices only)

| Old-surface behavior | Verdict | How the new surface does it |
|---|---|---|
| word-bounded opener in `check-inline-comments`, `check-comment-only` | preserved | `CodeTail.opensInlineTemplate` carries the `\b` |
| unbounded-word opener in `check-focus-posture`, `check-touch-target` (`xtemplate:` opened a template) | changed → word-bounded | the issue states word-bounded as the shared contract; AC-4 pins the flip |
| the tail carried across lines (`template:` on one line, the backtick on the next) | preserved | every guard pushes `\n` at a line end; AC-1 pins the multi-line tail |
| a string resets the tail | preserved | the guards call `reset()` where they skip a string |
| a backtick resets the tail (`check-focus-posture`, `check-touch-target`) / does not (`check-inline-comments`, tested `scan.out` in `check-comment-only`) | unified → consumed | `opensInlineTemplate` consumes the tail; a literal is never an opener for the next backtick |
| tail bound 40 (focus, touch) / 80 (inline-comments) / whole file (comment-only) | unified → 80 | `template:` plus a newline and indentation fits; the bound only exists to keep the string short |
| `${…}` counted by brace depth, carried across lines, escapes handled by the scanner first | preserved | `interpolationStep` is called after the scanner's own escape branch |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A guard's tail is fed differently from before (a character it used to reset on, or vice versa) and an inline template is silently read as a string — a false clean | low | med | each guard swapped alone with its suite and `guard-cli.test.mjs` as the bar; the parity ledger enumerates every difference | session | closed — four suites + the CLI harness green after each swap (`372933af`, `7e7e11be`, `0039b44d`) |
| R-2 | `check-comment-only` tested the opener on its whole stripped output; a tail fed from `stripCode`'s emitted slices misses a path (the `"""` text-block opener, a regex or `url()` slice) | low | med | every `out +=` in code state also feeds the tail; the suite's `template:`/`xtemplate:`/`.js` cases stay the bar | session | closed — the token slice feeds the tail, a text block resets it, a string resets it; suite green (`7e7e11be`) |
| R-3 | Sonar duplication between `inline-template.mjs` and a guard, or new-code coverage < 80% | low | low | the helper is small and fully exercised by its own suite; the guards only lose lines | session | open |

## Open questions / Assumptions

- **Assumption:** the `\b` alignment in `check-focus-posture`/`check-touch-target` (AC-4) is the
  intended contract, not a behaviour change to refuse: the issue names "word-bounded" as what the
  four share, and the `\b` was itself a review finding on PR #978 (F-5). Trivially reversible.
  — *Owner:* session · *Resolves by:* the owner's review of this PR

## Availability & concurrency (invariant #2)

N/A — does not affect availability: no runtime code, only repository hygiene scripts.

## Spring Modulith — modules, interfaces, events

N/A — no backend code in scope (Node scripts under `scripts/`).

### Module ownership (§4a)

N/A — no module touched.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

N/A — nothing under `frontend/` changes; the guards read `.ts` files but ship none.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** PR — draft open, CI gate on the phase 4 push

**Next action:** once CI is green, mark the PR ready for review and run the review gate (`pr-gates.md` §1); findings re-enter at Implement.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the helper and its suite (AC-1, AC-2) | ✅ | f07f7059 |

| 1 — `check-inline-comments` imports it | ✅ | 372933af |
| 2 — `check-comment-only` imports it | ✅ | 7e7e11be |
| 3 — `check-focus-posture` and `check-touch-target` import it (AC-4) | ✅ | 0039b44d |
| 4 — AC-3 sweep + close-out | ⏳ | the sweep ran clean (290 tests, no private copy left); close-out pending the gates |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `scripts/inline-template.mjs` — `CodeTail` + `interpolationStep`: the shared decision
- `scripts/inline-template.test.mjs` — AC-1, AC-2 pins
- `scripts/check-inline-comments.mjs` — `scan`/`skipTemplate` use the helper; `INLINE_TEMPLATE_OPENER` and `braceDelta` go
- `scripts/check-comment-only.mjs` — `openQuoted`/`copyInterpolation` use the helper; `TEMPLATE_KEY`, `INLINE_TEMPLATE_EXTENSIONS` and `braceDelta` go
- `scripts/check-focus-posture.mjs` — `typescriptRegions` uses the helper; `TEMPLATE_KEY` and `pending` go
- `scripts/check-focus-posture.test.mjs` — AC-4 pin
- `scripts/check-touch-target.mjs` — `maskTypescript` uses the helper; `TEMPLATE_KEY` and `pending` go
- `scripts/check-touch-target.test.mjs` — AC-4 pin
- `docs/plans/shared-inline-template-opener.md` — this plan
- `docs/plans/inline-comment-guard-blind-spots.md` — retired: PR #978 merged

---

## Phase 0 — The helper and its suite (AC-1, AC-2)

**Files:** Create `scripts/inline-template.mjs` · Test `scripts/inline-template.test.mjs`

- [x] **Step 1: Write the failing tests** — the AC-1 tail table and the AC-2 step table.
- [x] **Step 2: Run it, verify it fails** — `node --test scripts/inline-template.test.mjs` → FAIL (module missing).
- [x] **Step 3: Minimal implementation** — `CodeTail` (bounded tail, `push`/`reset`/consuming `opensInlineTemplate`) and `interpolationStep`.
- [x] **Step 4: Run it, verify it passes** — `node --test scripts/inline-template.test.mjs` → PASS.
- [x] **Step 5: Generalization-audit pass** — population: every script that decides an inline template or counts `${…}` braces (`git grep -n 'template\\s\*:\|braceDelta\|\${' scripts/*.mjs`) → the four guards, phases 1–3.
- [x] **Step 6: Commit** — `git commit -m "Add the inline-template opener the four guards will share (#979)"`
- [x] **Step 7: Update plan-doc execution status.**

## Phases 1–3 — One guard at a time

**Files:** Modify each guard · Test its own suite + `guard-cli.test.mjs`

- [x] **Step 1 (phase 3 only): Write the failing AC-4 test** in the focus and touch-target suites — both red on the unbounded opener.
- [x] **Step 2: Swap** the private opener and brace counter for the helper; delete the private copies.
- [x] **Step 3: Run** `node --test scripts/<guard>.test.mjs scripts/guard-cli.test.mjs` → PASS (121 / 111 / 162).
- [x] **Step 4: Commit** — `git commit -m "Read the inline-template opener from inline-template.mjs in <guard> (#979)"`

## Phase 4 — AC-3 sweep + close-out

- [x] `git grep -n 'template\\s\*:' scripts/check-*.mjs` → 0 hits; `node --test "scripts/*.test.mjs"` → PASS (290).
- [x] `node scripts/check-plan-file-structure.mjs --diff origin/main` → PASS; the RV-STYLE-1 guards over the diff → clean.
- [x] Retire `docs/plans/inline-comment-guard-blind-spots.md` (PR #978 merged; it cited only itself).
- [ ] Close-out in the last code-touching commit.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-06 | phase 0 | every script that decides an inline template or counts `${…}` braces | `git grep -n 'template\\s\*:\|braceDelta\|\${' scripts/*.mjs` | the four guards (`check-inline-comments`, `check-comment-only`, `check-focus-posture`, `check-touch-target`); `check-focus-posture`'s other brace counters are class-body and condition counters, not interpolation | phases 1–3 swap all four; the class-body counters stay |

---

## Acceptance-criteria verification (final)

- [x] **AC-1/AC-2:** `node --test scripts/inline-template.test.mjs` → PASS (7). Verified at `f07f7059`.
- [x] **AC-3:** `git grep -n 'template\\s\*:' scripts/check-*.mjs` → nothing; `node --test "scripts/*.test.mjs"` → PASS (290). Verified at `0039b44d`.
- [x] **AC-4:** `node --test scripts/check-focus-posture.test.mjs scripts/check-touch-target.test.mjs` → PASS, red first at `0039b44d^`. Verified at `0039b44d`.

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

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
