# Inline-comment guard blind spots (#977) Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** `scripts/check-inline-comments.mjs` reports a multi-line or issue-citing `<!-- … -->`
inside a `.ts` Angular inline `template:` literal and a `//` comment that opens with `#NNN`, and
`scripts/check-comment-only.mjs` reports a diff that only removes such an HTML comment as
comment-only — with `scripts/check-inline-comments.test.mjs` (extended) as the no-new-false-positive bar.

**Architecture:** Both guards learn one new region: a template literal that immediately follows
`template:` is an Angular inline template, and inside it `<!-- … -->` is a comment (the same
`html` region kind `.html` files already produce), not string content. Any other template literal
stays opaque string content — a spec's HTML fixture must keep counting as code for
`check-comment-only`, whose false clean is the costly direction. The provenance tell gains one
citing position: the comment's own opening.

**Persistence:** JDBC only (invariant #1). No tables or migrations — the slice is two Node
guard scripts and their suites.

**Source of intent:** GitHub issue #977 (filed from the review gate on PR #976).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — surfaced that AC-3
flips one existing assertion, `// #123 is the emphasis colour`, and that every one of the ~30
sentence-opening `#NNN` comments in the tree is an issue number, none a colour; confirmed all 28
`<!--` in `.ts` files sit in `template:` literals) · `riviera-plan-doc` (this template — forced the
`template:`-prefix trigger to be stated as the seam rather than "any backtick string") · `tdd` (each AC
pinned red at `findViolations` / `strip` / the CLI harness before the scanner changed) ·
`riviera-review-overlay` (review gate — at ready-for-review) · `riviera-docs-freshness`
(ran over `origin/main..HEAD` at close-out: `inline-comment-guard.md` states the citing positions
and the four-language scope, both updated in phase 3; no other substrate doc states the guard's scope)
· `riviera-local-debug` (unshallowed the clone before the guards' first `--diff`; `node --test
"scripts/*.test.mjs"` is the scoped run — no Gradle, no npm install needed).
No `postgres`, `riviera-modulith`, `riviera-java-conventions`, `riviera-frontend` or `playwright-cli`
row fires: the diff holds no SQL, no Java, and nothing under `frontend/`.

**Branch:** `claude/sdlc-977-7i0nix` (the cloud session's designated branch stands in for
`bugfix/inline-comment-guard-blind-spots`)

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a `.ts` component whose `template:` literal carries a two-line `<!-- … -->`
  the diff added, when the guard judges it, then one `multiline` finding spans those two lines.
  *Seam:* `findViolations({ path, lines, added })` (the exported detector) and the `--files` CLI ·
  *Pinned by:* `check-inline-comments.test.mjs` "flags a multi-line HTML comment inside an inline Angular template" + `guard-cli.test.mjs` "check-inline-comments --files judges an HTML comment inside an inline template"
- [ ] **AC-2:** Given such a template whose HTML comment cites `(#923)` on an added line, when judged,
  then a `provenance` finding names that line. *Seam:* `findViolations` · *Pinned by:*
  `check-inline-comments.test.mjs` "reports provenance inside an inline Angular template's HTML comment"
- [ ] **AC-3:** Given an added `//` comment whose text opens with `#NNN` (3–4 digits, e.g.
  `// #923's widget pushed Review past a phone's height.`), when judged, then a `provenance` finding
  fires; `// the #404 error`, `: #123`, and every other existing fixture keep their verdict.
  *Seam:* `findViolations` · *Pinned by:* `check-inline-comments.test.mjs` "a bare issue number opening the comment is a citing position"
- [ ] **AC-4:** Given a diff whose only change to a `.ts` file removes one `<!-- … -->` line from its
  `template:` literal, when `check-comment-only.mjs` runs, then it exits 0 reporting the file
  verified code-identical; a change to any other template literal's content (a spec's HTML fixture)
  is still reported as a code change. *Seam:* `strip(src)` (the exported normaliser) and the CLI ·
  *Pinned by:* `check-comment-only.test.mjs` "an HTML comment inside an inline Angular template is a comment" + "an HTML comment inside any other template literal is code" + `guard-cli.test.mjs` "check-comment-only passes when only an HTML comment left an inline template"

## Non-goals

- Scanning template literals that do not follow `template:` (a spec's HTML fixture, a SQL string).
- Recognising `#NNN` mid-sentence after `.`/`;`: the issue asks for the sentence-opening form only.
- `${…}` interpolation inside a template literal — the scanner's existing simplification stays.
- Reflowing or re-judging the ~30 pre-existing sentence-opening `#NNN` comments: the guard is
  diff-scoped, so they stay unreported until a diff touches them.
- The other guards (`check-focus-posture`, `check-touch-target`) — neither reads comments.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — new detection, replaces nothing.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | AC-3's looser anchor flags a colour / CSS id / Tailwind arbitrary value | low | med (a false positive is how a gate gets switched off) | anchor on the comment's own opening only (`//`, `/*`, `<!--`, a doc-comment `*`), keep the `[1-9]\d{2,3}(?!\w)` shape; the existing colour fixtures stay in the suite as the bar | session | open |
| R-2 | `check-comment-only` certifies a changed HTML fixture in a `.spec.ts` as comment-only | low | high (false clean in the tool that authorises not reading a diff) | only a literal that follows `template:` is an HTML region; a negative test pins any other template literal as code | session | open |
| R-3 | An unterminated `<!--` inside a template swallows the rest of the file | very low | low (a broken Angular template fails the build first) | the terminator wins, exactly as an unterminated `/*` does today; no special case | session | open |
| R-4 | The one flipped assertion (`// #123 is the emphasis colour`) is a decision the owner disagrees with | low | low | called out in the PR description with the population evidence; trivially reversible | session | open |

## Open questions / Assumptions

- **Assumption:** the owner accepts that `// #123 is the emphasis colour` now reads as provenance —
  the issue's AC-3 asks for exactly that form and the tree holds no colour written that way.
  *Owner:* ivopogace · *Resolves by:* PR review.
- **Assumption:** the issue's literal probe text, `carries provenance #923`, is a non-citing position
  (`provenance` is not a citing word, exactly as `the #404 error` is prose), so on that probe only
  `multiline` fires; `(#923)`, `see #923` or a comment opening with `#923` fires `provenance`. AC-2 is
  read as "the template's comment is scanned by the provenance rule", not as a new citing word.
  *Owner:* ivopogace · *Resolves by:* PR review.

## Availability & concurrency (invariant #2)

N/A — does not affect availability: no runtime code, only repository hygiene scripts.

## Spring Modulith — modules, interfaces, events

N/A — no backend code in scope (Node scripts under `scripts/`).

### Module ownership (§4a)

N/A — no module touched.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

N/A — nothing under `frontend/` changes; the guard reads `.ts` files but ships none.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** PR — draft open, merging latest `main`, then ready-for-review → review gate

**Next action:** run `references/pr-gates.md` §1 (check-review-range, then `/code-review` + `riviera-review-overlay`).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — inline template as an HTML region (AC-1, AC-2) | ✅ | e77f25e5 |
| 1 — sentence-opening `#NNN` (AC-3) | ✅ | 9cb1c789 |
| 2 — `strip` drops the inline template's HTML comments (AC-4) | ✅ | 7bb5bade |
| 3 — reference doc + close-out | ✅ | dc15c3bc |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `scripts/check-inline-comments.mjs` — `scan` opens an `html` region inside a `template:` literal; `TELLS.provenance` gains the comment-opening anchor
- `scripts/check-inline-comments.test.mjs` — AC-1, AC-2, AC-3 pins; the flipped colour assertion
- `scripts/check-comment-only.mjs` — `strip` drops `<!-- … -->` inside a `template:` literal only
- `scripts/check-comment-only.test.mjs` — AC-4 pins, positive and negative
- `scripts/guard-cli.test.mjs` — one CLI case per guard for the inline-template region
- `.claude/skills/riviera-java-conventions/references/inline-comment-guard.md` — the citing positions and the scope gain the two new rows
- `docs/plans/inline-comment-guard-blind-spots.md` — this plan

---

## Phase 0 — Inline template as an HTML region (AC-1, AC-2)

**Files:** Modify `scripts/check-inline-comments.mjs:scan` · Test `scripts/check-inline-comments.test.mjs`, `scripts/guard-cli.test.mjs`

- [ ] **Step 1: Write the failing tests** — the issue's probe component as the fixture, asserting one
  `multiline` finding over the comment's two lines and one `provenance` finding on its second line.
- [ ] **Step 2: Run it, verify it fails** — `node --test scripts/check-inline-comments.test.mjs` → FAIL (no findings).
- [ ] **Step 3: Minimal implementation** — when a backtick opens right after `template\s*:\s*`, the
  scanner enters the template in an `inlineTemplate` state; there `<!--` opens an `html` region and
  `-->` closes it, after which the template continues.
- [ ] **Step 4: Run it, verify it passes** — `node --test "scripts/*.test.mjs"` → PASS.
- [ ] **Step 5: Generalization-audit pass** — population: every script that walks template-literal
  state (`git grep -n "inTemplate\|quote === '\`'\|'\`'" scripts/*.mjs`) → the two guards this plan
  names; the focus/touch-target guards parse HTML with their own front-end and never see a `.ts`.
- [ ] **Step 6: Commit** — `git commit -m "Scan an Angular inline template's HTML comments in check-inline-comments (#977)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 1 — Sentence-opening `#NNN` (AC-3)

**Files:** Modify `scripts/check-inline-comments.mjs:TELLS` · Test `scripts/check-inline-comments.test.mjs`

- [ ] **Step 1: Write the failing test** — `// #923's widget pushed Review past a phone's height.` → `['provenance']`; ` * #795 AC-8: …` inside a touched Javadoc → provenance; `// the #404 error` stays clean.
- [ ] **Step 2: Run it, verify it fails** — `node --test scripts/check-inline-comments.test.mjs` → FAIL.
- [ ] **Step 3: Minimal implementation** — a third alternative in `provenance`: `^\s*(?:\*\s*)?#[1-9]\d{2,3}(?!\w)`, applied to the text after the opener strip.
- [ ] **Step 4: Run it, verify it passes** — `node --test "scripts/*.test.mjs"` → PASS.
- [ ] **Step 5: Generalization-audit pass** — population: every consumer of `TELLS` (`grep -n "TELLS" scripts/check-inline-comments.mjs`) → `tellViolations` and `markdownViolations`; the markdown path gets the same anchor for free and a skill line opening with `#NNN` is provenance there too.
- [ ] **Step 6: Commit** — `git commit -m "Read a comment that opens with #NNN as provenance (#977)"`
- [ ] **Step 7: Update plan-doc execution status.**

## Phase 2 — `strip` drops the inline template's HTML comments (AC-4)

**Files:** Modify `scripts/check-comment-only.mjs:strip` · Test `scripts/check-comment-only.test.mjs`, `scripts/guard-cli.test.mjs`

- [ ] **Step 1: Write the failing tests** — positive (the template with and without its `<!-- -->` line strip equal) and negative (`const html = \`<!-- a -->\`` vs `\`<!-- b -->\`` strip unequal); the CLI case commits the component, deletes the comment line, expects exit 0.
- [ ] **Step 2: Run it, verify it fails** — `node --test scripts/check-comment-only.test.mjs` → FAIL.
- [ ] **Step 3: Minimal implementation** — on entering a backtick string whose emitted prefix ends in `template\s*:\s*`, a `template` state that skips `<!-- … -->` and otherwise behaves as `str`.
- [ ] **Step 4: Run it, verify it passes** — `node --test "scripts/*.test.mjs"` → PASS.
- [ ] **Step 5: Generalization-audit pass** — same population as phase 0; both members now handled.
- [ ] **Step 6: Commit** — `git commit -m "Treat an inline template's HTML comment as a comment in check-comment-only (#977)"`
- [ ] **Step 7: Update plan-doc execution status.**

## Phase 3 — Reference doc + close-out

**Files:** Modify `.claude/skills/riviera-java-conventions/references/inline-comment-guard.md`

- [x] Add the comment-opening citing position and the inline-template scope row; run `node scripts/check-inline-comments.mjs --files` on the doc.
- [x] `node scripts/check-plan-file-structure.mjs --diff origin/main` → clean.
- [ ] Finalize Execution status in the last code-touching commit.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-06 | phase 0 | every script that tracks template-literal state | `git grep -n "inTemplate\\|'\`'" scripts/*.mjs` | `check-inline-comments.mjs`, `check-comment-only.mjs` | both in this plan (phases 0 and 2); `check-focus-posture` and `check-touch-target` already carve `template:` literals out with their own `TEMPLATE_KEY` and read HTML, not comments — three private copies of the opener test, a sharing refactor left to review |
| 2026-09-06 | phase 1 | every consumer of `TELLS` | `grep -n TELLS scripts/check-inline-comments.mjs` | `tellViolations`, `markdownViolations` | both get the opening anchor through the shared regex; no separate change |

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** Ran `node scripts/check-inline-comments.mjs --files <probe>.ts` on the issue's probe → `zz-probe.ts:4-5  multiline`. Verified at commit `7bb5bade`.
- [x] **AC-2:** Same probe with `(#923)` → `provenance` on line 5 (`check-inline-comments.test.mjs`, and the `--files` harness case). Verified at commit `e77f25e5`.
- [x] **AC-3:** `node --test scripts/check-inline-comments.test.mjs` → 29 pass, the opening-anchor cases included. Verified at commit `9cb1c789`.
- [x] **AC-4:** `node --test "scripts/*.test.mjs"` → 276 pass, the `strip` cases and the comment-only harness case included. Verified at commit `7bb5bade`.

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
