# Field-token classification + promotion (#470) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Session-recovery anchor:** re-read the **Execution status** section below before
> acting after any context compaction or in a fresh session.

**Goal:** the three token alphas #470 names — `--riv-field-fill`, `--riv-field-border`,
`--riv-card-track` — are exported from `frontend/src/testing/glass-tokens.ts` and their
genuine hand-copies deleted, while the one **deliberate fork** (`venue-map`'s near-opaque
date field) stays local and says why. A retune of those tokens in `styles.scss` becomes a
one-line test-side edit; the fork stays visibly outside that set.

**Architecture:** Pure test-side refactor — the third slice of the pattern #464/#465
(card glass) and #468 (card-ink-faint) established, applied to the `--riv-field-*` family
plus the single `--riv-card-track` copy F-1 surfaced. Unlike its predecessors this slice is
**not** a mechanical sweep: `FIELD_FILL_ALPHA` is copied five times but holds **two
different values**, so every site is classified against the *production* source before
editing. No production code, no thresholds, no computed contrast values change.

**Persistence:** N/A — frontend test files only (invariant #1 untouched).

**Source of intent:** GitHub issue #470 (deferred from PR #469 / issue #468; recorded there
under Non-goals and in its Generalization-audit log).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — the grill
**overturned the issue's own framing** of `venue-map`'s `0.9`: it is not a fork *of*
`--riv-field-fill`, it mirrors no token at all, which changed the fix from "keep + comment"
to "keep + comment + rename") · `riviera-plan-doc` (this template — proportional short form
for a mechanical slice) · `tdd` (green-to-green refactor: a full Vitest run before and after
must pass with identical file/test counts) · `riviera-frontend` (placement: `src/testing/` is
the shared test-fixture home, specs stay colocated — confirms the promotion target and that
no folder moves) · `riviera-tailwind` (read `venue-map.html`'s field utilities to classify the
`0.9` — the evidence that decided the fork; no Tailwind authored) · `angular-developer` +
angular-cli MCP (`list_projects` → Angular **22**, Vitest, `styleLanguage: scss`;
`get_best_practices` → no component/template/service code in the diff, so no v22 component
standard applies) · `riviera-local-debug` (frontend recipe: `npm run lint` + `npm test`; no
Gradle in scope) · `riviera-review-overlay` (review gate — after PR ready) ·
`riviera-docs-freshness` (merge close-out) · `playwright-cli` (**N/A** — no user-facing
behaviour change, unit contrast specs only, no `frontend/e2e/` surface) · `postgres` /
`riviera-modulith` / `riviera-java-conventions` / `riviera-stripe-payments` (**N/A** — no DB,
no backend, no money).

**Branch:** `claude/styles-comment-accuracy-yh7mqn` (cloud session — the designated remote
branch stands in for `bugfix/field-token-classification-and-promotion` per the riviera-sdlc
remote addendum). The branch already carries two unrelated comment-accuracy commits; this
slice is additive on top of them.

---

## The classification (the slice's actual deliverable)

Each site checked against the **production** source, not against the other specs:

| Constant | Sites | Value | Mirrors | Verdict |
|---|---|---|---|---|
| `FIELD_BORDER_ALPHA` | `auth-page`, `home`, `booking-dialog`, `find-booking`, `venue-map` | `0.55` ×5 | `--riv-field-border` (`styles.scss:59`) | **promote** — uniform; `venue-map.html:69` confirms even the map field uses the real `border-(--riv-field-border)` |
| `FIELD_FILL_ALPHA` | `auth-page`, `home`, `booking-dialog`, `find-booking` | `0.55` ×4 | `--riv-field-fill` (`styles.scss:60`) | **promote** — the surface each composites *over* differs (card glass vs the `0.82` panels), but the alpha is the token |
| `FIELD_FILL_ALPHA` | `venue-map` | `0.9` | **nothing** — `venue-map.html:69` sets `bg-[rgba(255,255,255,0.9)]`, a component-local literal | **fork: keep local, rename, comment** |
| `CARD_TRACK_ALPHA` | `auth-page` | `0.12` | `--riv-card-track` (`styles.scss:61`) | **promote** — single-use, but a `--riv-card-*` copy the charter covers (the F-1 finding that filed this issue) |

**Why the fork is renamed, not just commented.** The issue's AC asks for "a local constant
**and** a one-line comment". That is necessary but not sufficient here: after the promotion
`FIELD_FILL_ALPHA` becomes an *imported shared* name, and `venue-map` would be left holding a
local constant of the same name with a different value — the exact shape a future sweep reads
as "a copy someone missed". The name is also simply inaccurate: it mirrors no `--riv-field-*`
token. `DATE_FIELD_FILL_ALPHA` states what it is and cannot be mistaken for the shared one.
This is the F-2 failure class (a label that misdescribes what it labels) caught before it ships.

## Acceptance criteria (testable)

Mapped 1:1 onto issue #470's ACs.

- [ ] **AC-1 (classification):** Given each of the three constants, when this plan is read,
  then every site carries a **promote** or **fork** verdict with its production-source
  evidence. *Pinned by:* the classification table above; each row's claim is a file:line a
  reviewer can open.
- [ ] **AC-2 (promote):** Given the genuine mirrors, when `glass-tokens.ts` is read, then it
  exports `FIELD_FILL_ALPHA = 0.55`, `FIELD_BORDER_ALPHA = 0.55` and `CARD_TRACK_ALPHA = 0.12`,
  each with a TSDoc naming the `--riv-*` token it mirrors, and their copies are deleted.
  *Pinned by:* the exports compiling as imports in the five specs (a missing or renamed export
  fails `npm test` at type-check).
- [ ] **AC-3 (fork):** Given `venue-map`'s `0.9`, when the sweep is applied, then it remains a
  **local** constant, is renamed `DATE_FIELD_FILL_ALPHA`, and carries a one-line comment saying
  it is not `--riv-field-fill` and why. *Pinned by:* diff review + AC-4's unchanged results (a
  collapse onto `0.55` would move the date-field ratios).
- [ ] **AC-4 (parity):** Given the refactor, when `npm test` runs, then every suite passes with
  the same file and test counts as the baseline — **126 files / 979 tests** — and no threshold
  or computed contrast value changes. *Pinned by:* the full Vitest run before/after.
- [ ] **AC-5 (no overclaim):** Given the new TSDoc, when it is read, then it makes **no**
  completeness claim ("the last…", "no remaining…") that the diff does not achieve — four
  local alphas stay local by design (below). *Pinned by:* diff review against the residual
  list in the Generalization-audit log.

## Non-goals

- The four local alphas that mirror **no** `styles.scss` token, and are therefore not in
  #470's table: `BACK_FILL_ALPHA` (`booking-dialog`, `.btn-back` glass), `CHIP_TEAL_ALPHA`
  and `BANNER_TINT_ALPHA` (`venue-tab`, design-mock tints), and the two `0.82` panel glasses
  (`DIALOG_GLASS`, `PANEL_GLASS`). They stay local; **this slice does not leave the spec suite
  free of local constants**, and nothing in the diff may claim it does (AC-5).
- Promoting `MODE_CHIP_GLASS` (`home`, `--riv-mode-chip-glass`) — a real token, but single-use
  and outside #470's enumeration; deferred rather than smuggled in.
- Rewording `it()` titles or header docblocks that cite these alphas as prose — they document
  values for a human reader, not constants. (Same non-goal #465 and #468 held.)
- Any change to `styles.scss`, components, thresholds, or computed contrast values.

## Behavior-parity ledger

N/A — test-side refactor; no user-facing surface retired or replaced. Parity is AC-4:
identical file/test counts, all green, computed values unchanged.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A blind promote collapses `venue-map`'s `0.9` onto the shared `0.55`, silently weakening what its two date-field specs prove | **high** (the named trap) | high | Per-site classification against production source *before* any edit; the fork is renamed so the collision cannot recur; AC-4's identical results are the check | session | closed — `0.9` kept local as `DATE_FIELD_FILL_ALPHA`; both date-field specs still composite it (`venue-map.contrast.spec.ts:117,125`); 979/979 identical |
| R-2 | Deleting a local constant orphans a section-header comment, which then misdescribes what survives (PR #469's F-2) | med | low | Every deletion site's surrounding comment read first; header kept only where it still describes the remainder, else removed | session | closed — one header was in play (`home`'s "styles.scss card-surface tokens … live in the :root block"); it survives describing `MODE_CHIP_GLASS`, which **is** a card-surface token declared in that `:root` block, so it stays accurate and was kept. No other deletion site had a section header |
| R-3 | The new TSDoc repeats #467/#469's F-1 — a completeness claim the diff cannot cash | med | low | AC-5; the residual local-constant list is written into the audit log so the TSDoc has no reason to reach for a superlative | session | closed — the three TSDocs state what each mirrors and nothing more; the only cross-reference is `FIELD_FILL_ALPHA`'s pointer at the fork, which is a fact the diff establishes |
| R-4 | `venue-map`'s renamed constant leaves a stale citation (its comment names `venue-map.scss`, deleted in the Tailwind migration) | med | low | The rewritten comment cites `venue-map.html`, verified to exist at the named line | session | closed for the rewritten comment. **Two further `venue-map.scss` citations remain in that file** (its header docblock, and the row-label chip test) — pre-existing, untouched by this diff, deliberately not actioned here (see the audit log); they need their own issue |

## Open questions / Assumptions

### Resolved

- **Assumption:** `venue-map`'s `0.9` is a fork *of* `--riv-field-fill` (issue #470's framing)
  — **overturned** at intake. `venue-map.html:69` styles that field
  `bg-[rgba(255,255,255,0.9)]`: a component-local literal, mirroring no token. Its *border*
  does use `border-(--riv-field-border)`, which is why `FIELD_BORDER_ALPHA` promotes cleanly
  from the same file. This is what makes the rename (AC-3) part of the fix rather than polish.

## Availability & concurrency (invariant #2)

N/A — does not affect availability; no backend, no booking flow, test files only.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only; no backend Java in the diff.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

No components, templates, services, or routes touched. The diff is five Vitest contrast specs
plus the shared fixture `src/testing/glass-tokens.ts` (the `src/testing/` shared test-fixture
home per `riviera-frontend`; specs stay colocated with their components). `venue-map.html` is
**read** as classification evidence, not edited.

**Standards:** N/A — no component/template/service code in the diff, so the v22 component
standards (signals, `input()`/`output()`, native control flow, no `@HostBinding`) have no
surface here. TypeScript standard that does apply: no `any`; the three exports are inferred
`number` consts, matching `CARD_INK_SOFT_ALPHA`/`CARD_INK_FAINT_ALPHA` beside them.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** Merge — CI green, Review gate run in full (1 below-bar finding fixed), Sonar
gate green with its authoritative list pulled and empty

**Next action:** re-check CI + Sonar on the review-fix push, then merge PR #471 and run the
close-out (file the `venue-map.scss`-citation follow-up issue).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — promote 3 alphas, sweep 9 copies, fork-rename `venue-map`, green run | ✅ | `0b39d4b` (via PR #471) |
| review-fix — F-1 two-line inline comment shortened to one | ✅ | review-fix commit (via PR #471) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Review-gate note:** the gate ran in full via **invocation ladder rung 1** — the
`Skill("code-review")` probe succeeded, so the plugin's own workflow executed: eligibility
check → CLAUDE.md map → **5 parallel Sonnet review agents** → per-finding Haiku confidence
scoring, with `riviera-review-overlay` layered on (frontend bank RV-FE-1/6/7, RV-STYLE-1,
RV-PROC-1 — clean or N/A; RV-PROC-1 verified the *Skills consulted* line against the routing
table, including the `riviera-tailwind` entry the `venue-map.html` classification required).
The subagent fan-out was authorized by the user, this session carrying a standing "don't call
the Agent tool unless requested" instruction — `pr-gates.md` §1 requires asking, not silently
degrading. The eligibility subagent could not reach the GitHub MCP (interactive auth
unavailable in subagents); that check was run in the main thread instead rather than skipped.

Agents #2–#5 returned clean. Agent #2's value-preservation pass is the one that matters most
for R-1 and it confirmed every promoted site kept its exact alpha and `composite()` argument
order. Agents #3 and #4 each independently re-ran `npm test` (126/979) rather than trusting
this doc's claim.

**Sonar gate:** quality gate passed **and** the authoritative API list pulled and empty —
0 issues, 0 hotspots, 0 new bugs/vulns/smells, 0 duplicated blocks, 100% new-code coverage.
The false-clean guard passed on both legs (`new_lines=19` non-empty, `SonarCloud Code
Analysis` check-run `success`). Note for the next session: `api/measures/component` returns
`periods: [{value}]`, **not** `period: {value}` — parsing it the documented-in-passing way
yields `None` for every metric, which reads exactly like the unanalyzed false-clean the
runbook warns about. Read the raw JSON before believing an empty measures response.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (agent #1) | `styles.scss:53` — the comment-accuracy commit earlier on this branch rewrote a **one-line** inline comment into **two**, which RV-STYLE-1 and `frontend/.claude/CLAUDE.md` ("Inline comments are one line, or they are not written") forbid for what a diff *writes*. Confidence scored **25** — below the workflow's 80 bar, the scorer weighing the file's many pre-existing multi-line comments as established convention | **fixed anyway** — same call #467's F-1 established for the comment-accuracy class. Shortened to one line, keeping the word "tourist" (the clause that actually disambiguates); the dropped console-mock provenance is not lost — it already lives in `console-stats-strip.contrast.spec.ts`'s header docblock and `it()` title |
| — | review (agents #3 and #5, independently) | `venue-map.contrast.spec.ts:29,156` still cite `venue-map.scss`, deleted in the Tailwind migration | **not actioned** — pre-existing, outside this diff's lines; both agents noted it is *disclosed* in this plan (R-4 + audit log) rather than silent, which is what keeps it clear of F-2's failure mode. Needs its own issue |

---

## File structure

All modifications; nothing created (besides this plan):

**Promotion (1):**

- `frontend/src/testing/glass-tokens.ts` — add `FIELD_FILL_ALPHA`, `FIELD_BORDER_ALPHA`,
  `CARD_TRACK_ALPHA` with their TSDoc.

**Sweep — local constant deleted, import extended (4 files, 9 constants):**

- `frontend/src/app/auth/auth-page.contrast.spec.ts` — all three
- `frontend/src/app/pages/home/home.contrast.spec.ts` — fill + border
- `frontend/src/app/booking/booking-dialog.contrast.spec.ts` — fill + border
- `frontend/src/app/booking/find-booking.contrast.spec.ts` — fill + border

**Mixed — promote the border, keep and rename the forked fill (1):**

- `frontend/src/app/venue/venue-map.contrast.spec.ts`

**Untouched by design (Non-goals):** `BACK_FILL_ALPHA`, `CHIP_TEAL_ALPHA`,
`BANNER_TINT_ALPHA`, `MODE_CHIP_GLASS`, `DIALOG_GLASS`, `PANEL_GLASS`.

- `docs/plans/field-token-classification-and-promotion.md` — this plan.

---

## Phase 0 — Promote + classify-and-sweep + green run

**Files:** the six above.

- [x] **Step 1: Baseline** — `npm test` green before touching anything (126 files / 979 tests).
- [x] **Step 2: Promote** — export the three alphas from `glass-tokens.ts`, no completeness claim.
- [x] **Step 3: Sweep** the four pure-mirror specs (extend imports, delete locals).
- [x] **Step 4: Fork** — `venue-map`: promote the border, rename the fill, rewrite its comment.
- [x] **Step 5: Verify** — `npm run lint` clean; `npm test` → 126 / 979, all green.
- [x] **Step 6: Grep sweep (AC-2/AC-5)** — no residual copies of the three; residuals listed.
- [x] **Step 7: Commit + push + open the draft PR** (CI fires on `pull_request` only).
- [x] **Step 8: Update this plan's Execution status** in the same commit window.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-31 | intake grill | the three constants #470 names | `grep -rn 'FIELD_FILL_ALPHA\|FIELD_BORDER_ALPHA\|CARD_TRACK_ALPHA' frontend/src` | `FIELD_FILL` ×5 (**4× `0.55`, 1× `0.9`**), `FIELD_BORDER` ×5 (all `0.55`), `CARD_TRACK` ×1 | classified per the table above — 9 promoted, 1 forked |
| 2026-07-31 | intake grill | does `venue-map`'s `0.9` mirror a token? | `grep -rn '0\.9)' frontend/src/app/venue/venue-map.{ts,html}` | `venue-map.html:69` `bg-[rgba(255,255,255,0.9)]` — a literal, and `border-(--riv-field-border)` beside it | fork confirmed + renamed; the border promotes |
| 2026-07-31 | intake grill | what local alphas remain after this slice (so no TSDoc overclaims) | `grep -rn '^const [A-Z_]*ALPHA = ' --include='*.contrast.spec.ts'` | `BACK_FILL_ALPHA`, `CHIP_TEAL_ALPHA`, `BANNER_TINT_ALPHA` + the renamed fork | out of scope (Non-goals); recorded so AC-5 has a concrete referent |
| 2026-07-31 | phase 0, step 4 | the fork comment cited `venue-map.scss`, which the Tailwind migration deleted — does that citation appear elsewhere? | `grep -rn 'venue-map\.scss' frontend/src` | 2 more in `venue-map.contrast.spec.ts` (header docblock "mirrors every text-bearing token in `venue-map.scss`"; the row-label chip test) | **deferred, not actioned** — pre-existing, outside this diff's lines, and a comment-accuracy cleanup does not belong in a classification slice (the same call PR #469's review made on `styles.scss:53`). Needs its own issue |

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** classification table complete; each row cites the production line that decided it
      (`styles.scss:59–61`, `venue-map.html:69`).
- [x] **AC-2:** `glass-tokens.ts` exports `FIELD_FILL_ALPHA`, `FIELD_BORDER_ALPHA`,
      `CARD_TRACK_ALPHA`; grep for `^const (FIELD_FILL|FIELD_BORDER|CARD_TRACK)_ALPHA =` outside
      that file → **zero hits**; no bare `0.55`/`0.12` left in a field/track argument position.
- [x] **AC-3:** `venue-map.contrast.spec.ts:44` keeps `DATE_FIELD_FILL_ALPHA = 0.9` **local**, with
      a one-line TSDoc saying it is not `--riv-field-fill` and why; both date-field specs use it.
- [x] **AC-4:** `npm test` → **126 files / 979 tests**, identical to baseline; `npm run lint` clean.
- [x] **AC-5:** no completeness claim in the diff — four local alphas remain by design
      (`BACK_FILL_ALPHA`, `CHIP_TEAL_ALPHA`, `BANNER_TINT_ALPHA`, `DATE_FIELD_FILL_ALPHA`), the
      exact set the Non-goals name; the grep output matches it row for row.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying check.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Backend invariants (#1–#13): untouched — frontend test files only.
- [x] **Frontend** standards met — no component code changed; no `as any`.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — final state cites the merging PR.
- [ ] **The review gate ran in full** — the `/code-review` fan-out *plus* `riviera-review-overlay`.
