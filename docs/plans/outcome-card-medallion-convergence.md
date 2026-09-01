# `outcome-card` medallion convergence Implementation Plan

> **For agentic workers:** to implement this plan use `tdd` at the plan's named seams
> (`/implement` is the human's entry command — `riviera-sdlc`'s Implement row is the
> model's route), or the superpowers `subagent-driven-development`/`executing-plans`
> skills if present task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Converge `shared/outcome-card.ts`'s two tone glyphs onto `--riv-medallion-positive-*`
and `--riv-medallion-waiting-*`, retiring the app's last two medallion literals, fixing the
`pending` glyph's 2.46:1 dark-theme reading, and recording the verdict in class F-5 of the
colour-literal ledger and at the artboard lines the shipped app diverged from.

**Architecture:** The single significant decision is **which of the three medallion paintings is
canonical**, and it is settled *against* the design record rather than by it: the artboards drew
every medallion as a translucent brand tint (`rgba(43,184,212,0.18)`/`#0a6e85`,
`rgba(240,170,46,0.18–0.2)`/`#a86a12`), four sites later took the opaque-fill S7924 retune, and
`outcome-card` never did because its `aria-hidden` glyph owed no AA proof. This slice **ratifies
the retune as the design**: the opaque pairs win, `outcome-card` follows, and the artboards get
the `as-built diverges` pointers `docs/design/README.md` requires. The consequence the ticket
asked to be explicit about: `outcome-card`'s tones **stop theming**, which is the point —
#858's argument is that an ink over a fixed fill must not theme.

**Persistence:** N/A — frontend styling only; no table, no migration (invariants #1, #12 untouched).

**Source of intent:** [#869](https://github.com/ivopogace/riviera-sunbed-booking/issues/869)
(class **F-5** of `docs/design/colour-literal-token-audit.md`, under the closed epic #836;
surfaced by #858 / PR #867).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that the
ticket's premise is inverted and that its class-O attribution is wrong) · `riviera-plan-doc`
(this template — forced the behavior-parity ledger, which is what made the visual diff an
enumerated list rather than a sentence) · `tdd` (the decorative-glyph floor is written RED
against today's 2.46:1 before the convergence makes it green) · `riviera-review-overlay`
(review gate — **ran** on PR #871 at high effort via ladder rung 1, five findings F-1..F-5, all
fixed in `2b607ca`; its RV-FE-E2E owns the two-suite placement call below, and RV-STYLE-1's guard
is clean) ·
`riviera-docs-freshness` (**ran** at close-out over the slice's own range — see phase 2, which
is that sweep's output: the ledger row, the six artboard pointers, the `glass-tokens.ts`
population count, and the `tailwind.css` declaration note) · `riviera-tailwind` (styling
authority — its theme-invariant-token rule and the "take a per-state class ternary whole"
clause are why both tones move together rather than only the defective one) · `riviera-frontend`
(structure — confirmed no file moves: every touched file stays in the folder it is in) ·
`playwright-cli` + the mocked-suite convention (the two rendered legs; the auth landed states
had **no** e2e coverage at all before this slice) · `angular-developer` + the angular-cli MCP
`search_documentation` (host-element / CSS-custom-property styling guidance — confirmed the
existing `computed()` class-string shape is the idiomatic v22 form and needs no rework) ·
`frontend/.claude/CLAUDE.md` § Comments + `riviera-java-conventions` §6d, its canonical statement
(the review-fix round's doc-comment trim was made against that rule — no Java in the diff, but §6d
is where the frontend twin points, so it is named here rather than left implicit).

**Branch:** `claude/sdlc-869-research-92e6x6` — the cloud session's **designated remote branch**
standing in for `feature/outcome-card-medallion-convergence` (`riviera-sdlc` § *Remote / cloud
session addendum*). The literal `feature/…` branch is deliberately not created.

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given the `porcelain`, `riviera` and `dark` themes, when the `success` and
      `pending` tone glyphs' inks are composited over their own fills as those fills resolve on
      that theme's card, then every pair clears 3:1 (WCAG 1.4.11, the non-text floor a decorative
      glyph owes). Today the `pending` pair reads **2.46:1 in dark** and this AC fails.
      *Seam:* the `--riv-*` token values the glyph consumes, read through `testing/glass-tokens.ts`
      · *Pinned by:* `auth-page.contrast.spec.ts` › `the outcome-card tone glyphs clear the
      non-text floor on this theme's card`
- [x] **AC-2:** Given a rendered auth page under `porcelain` and under `dark`, when the
      signed-in card and the pending card are shown, then each tone glyph's computed
      `background-color`/`color` equal the registered medallion pair — **the same rgb() in both
      themes**. *Seam:* the `/account/sign-in` route's rendered DOM ·
      *Pinned by:* `e2e/fixed-fill-state-skins.e2e.ts` › `the signed-in outcome card paints the
      registered positive state` + `the submitted-for-approval outcome card paints the registered
      waiting state`
- [x] **AC-3:** Given the migrated source, when the tree is swept, then `shared/outcome-card.ts`
      contains neither `rgba(240,170,46,0.2)` nor `#a86a12` nor `riv-accent-chip-fill` nor
      `riv-accent-ink`, and `#a86a12` appears **nowhere** under `src/app` — while
      `rgba(240,170,46,…)`'s four out-of-family homes keep theirs.
      *Seam:* the component sources, swept as text · *Pinned by:*
      `fixed-fill-token-skins.contrast.spec.ts` › the `MIGRATED_SITES` / `EXCLUSIVE_LITERALS` /
      `OUT_OF_FAMILY` sweeps
- [x] **AC-4:** Given the decision is made, when the substrate is read, then the ledger's F-5 row
      reads `done` with this PR, the six diverged artboard lines each carry an
      `as-built diverges — see #869` pointer, and the verdict is stated at the
      `--riv-medallion-*` declaration in `tailwind.css`. *Seam:* the substrate docs themselves ·
      *Pinned by:* review-gate reading (no test — a docs assertion would restate the diff)

## Non-goals

- **Re-opening `--riv-medallion-*` toward the artboard tint.** The research found the tokens carry
  the *drifted* values; the maintainer's call is to ratify the drift, not reverse it. Bringing
  `booking-confirmation` / `booking-pay` / `request-confirmation` back to the tint would be an
  epic, not this slice.
- **`operator/requests-tab.html:94`'s green 52px medallion** — the same form, but `/opacity` tints
  inside the porcelain-pinned operator console, so no theme drift to fix. Stays class O's (#852).
- **The amber notice banner** (#868) — the medallion's exact waiting pair on a different form,
  with accessible text. Its own family, its own ticket.
- **The zoom toggle's dark-theme AA failure (#870)**, found by this slice's generalization audit.
  A different family (accessible text on a labelled control, over the map wash rather than the card
  glass) and a different proof; folding it in would widen the PR past the finding it was opened for.
- **`--riv-accent-chip-fill` / `--riv-accent-ink`.** `outcome-card` stops consuming them; both
  keep other consumers (the segmented control's selected option card, links, the mode toggle) and
  are not touched.
- **A dark override for any medallion token.** The family is theme-invariant by construction and
  stays that way.

## Behavior-parity ledger

> The slice repaints a shipped surface, so the "visual change called out explicitly rather than
> folded into a migration" that AC-2 of the issue demands is **this table**.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `success` glyph fill = `--riv-accent-chip-fill`, a teal tint composited over the themed card | **changed** | now the opaque `--riv-medallion-positive-fill` (`#d9f2f7`). Light themes shift subtly (composite `#c5eef5`–`#d9f2f7` → flat `#d9f2f7`); **dark changes visibly**: a dark teal circle becomes a pale ice-blue one |
| `success` glyph ink = `--riv-accent-ink`, themed (`#085a6e` / `#7cd7e8`) | **changed** | now the fixed `#0a5f74`. Dark loses its light-teal ✓ for a dark-teal one — legible on the new pale fill (6.20:1), and the deliberate end of the one medallion that themed |
| `pending` glyph fill = `rgba(240,170,46,0.2)` over the themed card | **changed** | now the opaque `--riv-medallion-waiting-fill` (`#fcf0d9`) |
| `pending` glyph ink = `#a86a12`, fixed, over a fill that themed | **changed → defect fixed** | now `--riv-medallion-waiting-ink` (`#8a5410`). This is the 2.46:1-in-dark reading AC-1 pins |
| glyph border `rgba(255,255,255,0.6)`, inset shadow, 66px box, `aria-hidden`, glyph characters | **preserved** | untouched — class R's glass-border family (#853) owns the border, not this slice |
| `success`/`pending` glyph geometry, the `computed()` ternary shape, `OutcomeTone` API | **preserved** | only the two colour branches change; the ternary moves whole (`riviera-tailwind`, #858's atomic-ternary rule) |
| the auth card's heading/body/CTA, `aria-labelledby`, unique heading ids | **preserved** | untouched |
| `auth-page.contrast.spec.ts:48`'s "deliberately excluded" glyph note | **changed** | becomes a measured 3:1 assertion (AC-1). The WCAG 1.4.3 AA exemption is unchanged and still stated; what changes is that the exemption stops meaning *unchecked* |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The dark-theme repaint is judged wrong once seen (a pale medallion punched into a dark card) | med | med | Enumerated in the behavior-parity ledger before any code, and the maintainer chose this option knowing it; the two e2e legs make the shipped value inspectable | ivopogace | **open — the one row that stays open until the repaint is eyeballed.** It is a judgement, not a defect: every test passes either way |
| R-2 | The `rgba(240,170,46,…)` sweep over-reaches onto the four out-of-family homes (`pending-approval-banner`, `booking-dialog`'s mode note, `app.html`'s sun, `home.html`'s photo sun) | med | med | `OUT_OF_FAMILY` gains rows asserting each keeps its literal — the positive half of the sweep #851 invented; only `#a86a12` (single-site) joins `EXCLUSIVE_LITERALS` | — | **closed** in phase 1 — all four rows added and green |
| R-3 | The floor test is written so it passes today, proving nothing | med | high | Phase 0 runs it RED first and records the exact failing number before any component edit | — | **closed** — RED confirmed at `riviera` 2.82:1 (stop `#0a4f6e`) and `dark` 2.46:1 (stop `#3b4a5f`), matching the hand-computed research values; green after the convergence |
| R-4 | The e2e's `pending` leg is unreachable — the stage needs register-202-then-signin-transport-failure | low | med | Path confirmed in `auth-page.ts:505-532`: a non-401/429 sign-in failure maps to `'error'` and falls through to `submittedForApproval.set(true)`. Mockable as a 500 on the sign-in POST | — | **closed** in phase 1 — the leg renders and asserts in both themes |
| R-5 | Frontend-only slice, so no Flyway version to claim and no backend collision surface | — | — | N/A by construction | — | closed |

## Open questions / Assumptions

- **Assumption:** the six artboard lines are the complete diverged set (`riviera-sign-in.dc.html`
  128/138/148, `riviera-sunbeds-liquid-glass-v3.dc.html` 539/644/679 — post-insertion, since the
  pointers this slice adds shift the lines they cite). Enumerated by grepping the
  medallion *form* across all four `.dc.html` records, not by value. — *Owner:* the phase-2
  generalization audit · *Resolves by:* phase 2

### Resolved

- **Open question:** should the three landed-state surfaces look alike? — **Yes, converge onto
  `--riv-medallion-*`.** Maintainer decision, 2026-09-01, taken against the research finding that
  `outcome-card` is the *faithful* site and the tokens carry the drift.
- **Open question:** do `aria-hidden` glyphs owe a contrast floor, given WCAG 1.4.3 exempts them
  and `auth-page.contrast.spec.ts:48` excludes them deliberately? — **Yes, 3:1 measured**
  (AC-1). The AA exemption stands; what ends is the exemption doubling as an absence of proof.
- **Open question:** does the slice also carry the `as-built diverges` artboard pointers #858
  never wrote? — **Yes** (AC-4, phase 2).
- **Open question (raised by the grill, not the ticket):** is the `pending` fill a class-O
  `/opacity` position, as the ticket states? — **No.** It is `bg-[rgba(240,170,46,0.2)]`, an
  arbitrary rgba literal; Tailwind v4 compiles the `/N` modifier to
  `color-mix(in oklab, …, transparent)` but emits an arbitrary rgba verbatim. #852's class-O row
  enumerates the slash form (`payouts-tab.html:165`, `daily-view-tab.html:142`) and this position
  is not in that population — so **the fill substitution carries no computed-value change of the
  class-O kind**, and what movement it does carry is the deliberate repaint above. The ticket's
  "the `/opacity` tint (class O, #852's) resolves with it" is corrected in the ledger's F-5 row.

## Availability & concurrency (invariant #2)

N/A — frontend styling only. No booking, availability, beach-map or `(set, date)` write path is
in scope; the slice cannot reach the availability table.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No Java in the diff.

### Module ownership (§4a)

N/A — no backend behavior added or moved.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/outcome-card.ts` | existing | standalone component | `input()` + `computed()` class string (unchanged shape) | none |
| FE-2 | `auth/auth-page.contrast.spec.ts` | existing | unit spec | — | — |
| FE-3 | `shared/fixed-fill-token-skins.contrast.spec.ts` | existing | unit spec | — | — |
| FE-4 | `e2e/fixed-fill-state-skins.e2e.ts` | existing | Playwright spec (mocked suite) | — | — |

**Standards:** standalone components, `input()`/`computed()` signal APIs, `@switch` control flow —
all already in place; the slice changes two colour branches inside one `computed()` and adds no
new API surface. **Suite placement (RV-FE-E2E):** the two rendered legs join the **mocked**
`frontend/e2e/` suite, beside the five medallion legs they extend — the flow is fully mockable
and CI runs `npm run test:e2e:a11y`.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** `merge gate — all three gates passed on 2b607ca; awaiting the maintainer's
look at the dark-theme repaint (risk R-1) before merge`

**Next action:** maintainer decision on R-1 (the one row this slice cannot close for itself — the
repaint is a judgement, and every test passes either way). On approval: merge, then the close-out
checklist (`references/pr-gates.md` §3) — issue #869 closes via the PR, #870 already filed, and
the docs-freshness sweep is already folded in as phase 2.

**Gate results on `2b607ca`:** CI 8/8 green. Review gate ran in full (ladder rung 1, high effort):
five findings, all fixed, comment posted. Sonar gate green **and its reported list actually
pulled** — 0 issues, 0 hotspots, 0 bugs, 0 smells, 0 duplicated blocks, gate conditions 5/5 OK.
The analysis is real, not a false clean (`new_lines: 28`); `new_coverage` reads 0.0% but
`new_lines_to_cover` is 0, so the ≥80% condition is inapplicable and Sonar omits it from the gate
entirely — the slice's only executable change is a class-string swap the unit and e2e specs both
exercise.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the decorative-glyph floor, RED → convergence, GREEN | ✅ | |
| 1 — the token-registry guards (sweep + two rendered legs) | ✅ | |
| 2 — the substrate: ledger row, artboard pointers, declaration notes | ✅ | |
| 3 — review-gate findings F-1..F-5 | ✅ | `2b607ca` |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (`/code-review` agents #1 + #4, independently) | **§6d — the contract, not the changelog.** The `--riv-medallion-*` declaration went 40 → 66 lines of decision-history narration using §6d's own flagged phrasings ("used to…", "deliberately…"); same in `outcome-card.ts`'s member doc (~15 lines vs a ~3 budget), `glass-tokens.ts`, both specs and the e2e. Precedent verified: PR #862's review trimmed a sibling block **in this same file** on this rule. | fixed — trimmed to contract + warning + `Rationale:` pointers; the narrative stays in the plan doc and ledger §F-5 where it already lived. Block back to 44 (base was 40) |
| F-2 | review (agent #3) | **Self-inflicted stale citations.** The six `as-built diverges` pointers this slice inserts shift the very lines it cites, and the ledger, `tailwind.css` and this plan all still named the pre-insertion numbers. Verified: sign-in divs are at 128/138/148, v3 at 539/644/679. | fixed — all three sites renumbered; `tailwind.css`'s copy removed entirely by F-1's trim, so the fact now lives once, in the maintained ledger |
| F-3 | review (agent #2, extended by self-check) | **Plan-doc close-out inconsistent.** Phase 1/2 step boxes unticked against a ✅ table; the AC-verification block's edit had silently no-matched (a "Run " prefix that was never in the file) so it never landed; three `PR #NN` placeholders. | fixed — boxes ticked, AC block landed with the verified numbers, `#871` throughout |
| F-4 | review (agent #5) | **Direct self-contradiction** in `auth-page.contrast.spec.ts`: the `TONE_GLYPHS` doc says the pairs are opaque so `alpha: 1` collapses the composite, while the loop's own comment justified per-stop compositing by a "TRANSLUCENT glyph fill" — leftover RED-phase phrasing that the convergence falsified. | fixed — the comment now states the real reason the loop is kept: it is the tripwire that measures a translucent fill against the themed card if one is ever reintroduced |
| F-5 | review (agent #5) | **Stale sibling count + AC pin-names.** `glass-tokens.ts:281` still said "the five medallion sites" (untouched by the diff, but falsified by it — the docs-freshness counting sweep's case); both AC *Pinned by* names were paraphrases, not the shipped test titles; `#c5ee f5` typo. | fixed — count made count-free rather than re-adjudicated (agent #5 showed the base "five" is itself contested), pin-names now verbatim, typo corrected |

---

## File structure

- `frontend/src/app/shared/outcome-card.ts` — the two tone branches move onto the medallion pairs
- `frontend/src/app/auth/auth-page.contrast.spec.ts` — the RED-first 3:1 floor for the tone glyphs; the line-48 note rewritten from "excluded" to "exempt from AA, held to 3:1"
- `frontend/src/app/shared/fixed-fill-token-skins.contrast.spec.ts` — `outcome-card` joins `MIGRATED_SITES`; `#a86a12` joins `EXCLUSIVE_LITERALS`; the four `rgba(240,170,46,…)` homes join `OUT_OF_FAMILY`
- `frontend/src/testing/glass-tokens.ts` — the medallion docblock's population count and the F-5 verdict
- `frontend/src/tailwind.css` — the verdict recorded at the `--riv-medallion-*` declaration
- `frontend/e2e/fixed-fill-state-skins.e2e.ts` — the two auth legs
- `docs/design/colour-literal-token-audit.md` — F-5 row → `done`, with the class-O correction
- `docs/design/riviera-sign-in.dc.html` — three `as-built diverges` pointers
- `docs/design/riviera-sunbeds-liquid-glass-v3.dc.html` — three `as-built diverges` pointers
- `docs/plans/outcome-card-medallion-convergence.md` — this plan

---

## Phase 0 — The decorative-glyph floor, RED → convergence, GREEN

**Files:** Modify `frontend/src/app/auth/auth-page.contrast.spec.ts` · Modify
`frontend/src/app/shared/outcome-card.ts`

- [x] **Step 1: Write the failing test** — model each tone glyph as an ink over a `Glass` fill so
      the *test* stays fixed while convergence changes only the data (alpha 0.2 → 1). This is the
      guard shape the drift needed: it is the only spec that composites a glyph fill onto **this
      theme's** card.

- [x] **Step 2: Run it, verify it fails** — `npm test -- auth-page.contrast` → FAIL on the dark
      leg, `pending glyph over stop #… — expected 2.46 to be >= 3`

- [x] **Step 3: Minimal implementation** — swap the two branches of `glyphClasses()` onto
      `bg-riv-medallion-positive-fill text-riv-medallion-positive-ink` and
      `bg-riv-medallion-waiting-fill text-riv-medallion-waiting-ink`, update the spec's Theme rows
      to the opaque pairs, and rewrite the component docblock's tone paragraph to state the
      convergence and that the tones no longer theme.

- [x] **Step 4: Run it, verify it passes** — `npm test -- auth-page.contrast outcome-card` → PASS

- [x] **Step 5: Generalization-audit pass** — the population was widened past the plan's own
      wording: *every `aria-hidden` decorative glyph* would have been resemblance, and the real
      mechanism is **a fixed ink over a translucent fill on a themeable host**, decorative or not.
      Six sites, one defect (**#870**, worse than this one — accessible text at 1.2:1 in dark).
      Full table in the Generalization-audit log below.

- [x] **Step 6: Commit** — `git commit -m "Converge outcome-card's tone glyphs onto the medallion skin (#869)"`

- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — The token-registry guards

**Files:** Modify `frontend/src/app/shared/fixed-fill-token-skins.contrast.spec.ts` · Modify
`frontend/e2e/fixed-fill-state-skins.e2e.ts`

- [x] **Step 1: Write the failing tests** — the `MIGRATED_SITES` row for
      `shared/outcome-card.ts`, `#a86a12` in `EXCLUSIVE_LITERALS`, the four
      `rgba(240,170,46,…)` `OUT_OF_FAMILY` rows, and the two rendered legs (signed-in via a
      mocked signed-in customer session; pending via register-202 + a 500 on the sign-in POST).

- [x] **Step 2: Run them, verify they fail** — on a pre-phase-0 tree they would; on this tree the
      sweep rows pass immediately (phase 0 already removed the literals) and the **e2e legs are
      the genuine new proof** — run them first against `main`'s component to see them fail.

- [x] **Step 3–4: Green** — `npm test -- fixed-fill-token-skins` and
      `npm run test:e2e:a11y -- fixed-fill-state-skins` → PASS

- [x] **Step 5: Commit** — `git commit -m "Guard the converged outcome-card medallion in both themes (#869)"`

- [x] **Step 6: Update plan-doc execution status.**

---

## Phase 2 — The substrate

**Files:** Modify `docs/design/colour-literal-token-audit.md` ·
`docs/design/riviera-sign-in.dc.html` · `docs/design/riviera-sunbeds-liquid-glass-v3.dc.html` ·
`frontend/src/testing/glass-tokens.ts` · `frontend/src/tailwind.css`

- [x] **Step 1:** F-5 row → `done — #869, PR #871`, carrying the verdict, the artboard finding,
      and the class-O correction.
- [x] **Step 2:** the six `<!-- as-built diverges — see #869 -->` pointers.
- [x] **Step 3:** the `--riv-medallion-*` declaration note in `tailwind.css` and the population
      count in `glass-tokens.ts` (five medallion sites → seven).
- [x] **Step 4:** `node scripts/check-plan-file-structure.mjs --diff origin/main` → clean.
- [x] **Step 5: Commit** — `git commit -m "Record the F-5 verdict in the ledger and at the artboards (#869)"`

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-01 | phase 0 — the `pending` glyph's 2.46:1 dark reading | **A fixed hex ink sharing a class string with a translucent fill**, so the ink is pinned while its effective fill composites onto a host the theme moves. Named as the mechanism the defect needs, *not* as "other medallions" — which is what made it reach past the medallion form entirely | `grep -rnE '(bg-\[rgba\(\|bg-\[#[0-9a-fA-F]{3,8}\]/\|bg-riv-[a-z-]+/)' frontend/src/app --include=*.ts --include=*.html \| grep -E 'text-\[#' \| grep -v '\.spec\.'` | 6 | **1 real defect → filed as #870**; 5 cleared with reasons (below) |

**Judgements, one per site — a clean audit has to say why, not just how many:**

| Site | Verdict |
|---|---|
| `shared/beach-map-canvas.html:20,35` (the #713 Fit/100% zoom toggle) | **Defect, and worse than the one that started the sweep** — accessible text (`Fit`/`100%`), so AA 4.5:1, not 1.4.11's 3:1. Both branches pin their ink over the sea→sand wash, which themes (`DARK_WASH_STOPS`). Measured: selected **1.16–1.22:1** on the dark wash, unselected **3.77–3.82:1**. No contrast spec covers the control at all. Out of this slice's family (a labelled toggle, not a medallion; needs `venue-map.contrast.spec.ts`'s per-family wash maths) → **#870** |
| `operator/requests-tab.html:94` | Cleared — porcelain-pinned operator console, no themeable host. Already class O's (#852) and this slice's stated non-goal |
| `venue/availability-calendar.html:8` | Cleared — `rgba(255,255,255,0.97)` is 97% opaque, and `availability-calendar.contrast.spec.ts` already proves the popover's surfaces as opaque |
| `venue/availability-calendar.html:20,40` | Cleared — a `hover:` tint over that same near-opaque popover, not over a themed host |

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** `npm run test:a11y` → 569 passed. Verified RED first at `riviera` 2.82:1 /
      `dark` 2.46:1 before any component edit; green after.
- [x] **AC-2:** `playwright test --config playwright.a11y.config.ts fixed-fill-state-skins` → 16
      passed. Verified to FAIL against the pre-change component with the old computed values
      (`rgba(43,184,212,0.18)` / `rgba(240,170,46,0.2)`), so the legs are not vacuous.
- [x] **AC-3:** `ng test --include="…/fixed-fill-token-skins.contrast.spec.ts"` → 15 passed, and
      verified to fail on a deliberately reintroduced literal.
- [x] **AC-4:** the ledger's F-5 row, the six artboard pointers, the `tailwind.css` declaration
      note and the `glass-tokens.ts` docblock are all in the diff.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced (invariant #1) — N/A, no backend in the diff.
- [x] **Availability** section justified N/A (invariant #2) — no availability write path in scope.
- [x] Pool + cutoff rules honored (invariants #3, #4) — N/A.
- [x] **Modulith** section justified N/A (invariant #11) — frontend-only.
- [x] **Payment/payout** section justified N/A (invariants #5, #8, #9).
- [x] Refund policy (invariant #10) — N/A.
- [x] Timezone (invariant #6) — N/A.
- [x] Booking codes (invariant #7) — N/A.
- [x] Flyway (invariant #12) — N/A, no schema change.
- [x] **Frontend** standards met; no `as any`; the `riviera-tailwind` named-utility rule honored
      (both branches use `bg-riv-*`/`text-riv-*`, no arbitrary values left).
- [x] Execution status at HEAD matches reality.
- [x] Risk register has no stale `open` rows; Open Questions empty.
- [x] **Close-out written in THIS PR**, citing `merged via PR #871`.
- [x] **The review gate ran in full** per `references/pr-gates.md` §1 plus `riviera-review-overlay` — rung 1 (the plugin workflow), high effort; five findings, all fixed and re-validated.
