# Class-O Alpha Normalisation (option C) Implementation Plan

> **For agentic workers:** to implement this plan use `tdd` at the plan's named seams
> (`/implement` is the human's entry command — `riviera-sdlc`'s Implement row is the
> model's route). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the per-site alpha and base-colour drift that rule B preserved in class O
onto one stated scale — every class-O alpha a multiple of 5, one walk-in hatch, one amber
family — with a per-site before/after computed-style diff for every position that moves.

**Architecture:** The single most significant decision is that the scale is **the ladder, not a
new token shape**: alphas stay at the call site in Tailwind's `/opacity` modifier (rule B is
extended, not retired), and normalisation is expressed as a *standing assertion over the alphas*
— "no class-O position may carry an alpha that is not a multiple of 5". That keeps every
`toHaveCSS` in `oklab()` form, keeps each alpha beside the comment explaining it, and turns the
scale into the same kind of boundary guard #852 left behind rather than a new registry to
maintain.

**Persistence:** N/A — frontend-only, no tables, no migration (invariant #1 untouched).

**Source of intent:** GitHub issue #879 (the option-C follow-up #852 deliberately left undone),
against `docs/design/colour-literal-token-audit.md` § Class O.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that the
walk-in hatch is a **three**-way, not the two-way the issue describes; that `--riv-warn-edge` has
a third site the issue's table misses, `daily-view-tab.html:131`'s trigger button; and that the
two operator warn panels are hand-rolled twins of `shared/confirm-panel`, which is what makes the
amber merge a role match rather than a value coincidence) · `riviera-plan-doc` (this template —
forced the behaviour-parity ledger, which is where the sub-3:1 trigger-button edge surfaced) ·
`tdd` (each phase moves the guard spec's expected value first, watches it go red, then moves the
token) · `riviera-review-overlay` (review gate — run at ready-for-review) ·
`riviera-docs-freshness` (**ran** over the slice range at close-out — see Execution status) ·
`riviera-tailwind` (theme-invariance rationale: the merged amber family inherits **#868's**
fixed-fill-pins-its-ink argument, not class O's unreachable-dark-branch one, because the legal
pages and the withheld-email notice render under all three document themes; also the
take-the-skin-whole rule for the repainted panels) · `riviera-frontend` (confirmed the token
registry has only **two** homes here — `tailwind.css` + `testing/glass-tokens.ts`; `core/theme.ts`
carries the switcher registry only, so no row there) · `playwright-cli` (the mocked-suite
`toHaveCSS` before/after diffs that are AC-2's evidence)

**Branch:** `claude/sdlc-879-8a5l2p` — **the cloud session's designated branch stands in for
`feature/class-o-alpha-normalisation`** (`riviera-sdlc` § Remote/cloud session addendum). Branched
from `origin/main` at `6d3851e`. Note: the local `main` ref in this container is a stale unrelated
lineage — use `origin/main` for every diff and merge-base.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the class-O token population, when the guard sweep runs, then **no**
      `/opacity` position in `frontend/src` carries an alpha that is not a multiple of 5, and the
      meta-test proves the new assertion can fail. *Seam:* the tree-wide source sweep in
      `shared/class-o-tint-tokens.contrast.spec.ts` (the same seam #852's boundary guard uses) ·
      *Pinned by:* `class-o-tint-tokens.contrast.spec.ts` → `'every /opacity alpha sits on the
      multiple-of-five ladder'` + `'recognises an off-ladder alpha — the ladder sweep must be able
      to fail'`
- [ ] **AC-2:** Given each of the 8 ladder-moved positions, when its element is rendered in the
      mocked e2e, then its computed colour equals the **new** ladder value and the assertion
      records the outgoing one beside it. *Seam:* `page.locator(...).toHaveCSS()` against a real
      render in `e2e/class-o-tint-tokens.e2e.ts` · *Pinned by:* `class-o-tint-tokens.e2e.ts` →
      `'the ladder-moved positions paint their new alpha'`
- [ ] **AC-3:** Given `beach-cell`'s aisle boundary, when the ladder sweep and the cell spec run,
      then its alpha is still exactly `/55` and is named in the spec as load-bearing with its
      WCAG 1.4.11 reason. *Seam:* the `CELL_CLASS` map's `gap` entry · *Pinned by:*
      `beach-cell.spec.ts` → `'keeps the aisle boundary at /55, off the collapse'`
- [ ] **AC-4:** Given the three walk-in hatch renderings, when each is rendered, then all three
      resolve to **one** `--riv-walkin-hatch` declaration and no source paints a
      `repeating-linear-gradient(45deg` of `--riv-console-tint` inline. *Seam:* the
      `--riv-walkin-hatch` image token + a tree-wide source sweep · *Pinned by:*
      `class-o-tint-tokens.contrast.spec.ts` → `'declares one walk-in hatch, and no site rebuilds
      it inline'`; painted by `class-o-tint-tokens.e2e.ts` → `'the three walk-in renderings share
      one hatch'`
- [ ] **AC-5:** Given the six amber surfaces, when each is rendered, then every one paints
      `--riv-warn-{edge,fill,ink}` and the tokens `--riv-warn-tint`, `--riv-confirm-warn-*` and
      `--riv-notice-banner-*` no longer exist in `tailwind.css`. *Seam:* the `@theme inline` row +
      base-block declaration read as text by `testing/stylesheet-tokens.ts` · *Pinned by:*
      `class-o-tint-tokens.contrast.spec.ts` → `'declares one amber family, and no retired amber
      token survives'`
- [ ] **AC-6:** Given the merged amber ink on the merged amber fill, when contrast is computed,
      then it is **≥ 4.5:1** and no surface's outgoing ratio is reduced below a floor it cleared.
      *Seam:* `src/testing/contrast.ts`'s composited-ratio helper · *Pinned by:*
      `withheld-email-notice.contrast.spec.ts` → `'the merged amber pair clears AA, above the
      outgoing pair'` (measured: 5.54:1 → **6.86:1**)
- [ ] **AC-7:** Given `daily-view-tab`'s close-sales trigger button, when its edge is measured
      against its own fill, then the sub-3:1 result is recorded in an assertion and the button is
      listed in `docs/design/non-text-contrast.md`'s rule-2 family table with all three conditions
      demonstrated. *Seam:* the rule-2 families table + its named spec · *Pinned by:*
      `daily-view-tab.contrast.spec.ts` → `'the close-sales trigger is identified by its label,
      not its edge'` (edge 1.65:1 → 1.48:1; label 15.0:1, condition 1 met)
- [ ] **AC-8:** Given the ledger, when class O's section is read, then it records the chosen scale
      beside rule B, a per-site before/after table for all moved positions, and the named
      exemption. *Seam:* `docs/design/colour-literal-token-audit.md` § Class O · *Pinned by:*
      review-gate reading + `riviera-docs-freshness` at close-out (prose — no test)

## Non-goals

- **Componentising the two hand-rolled operator warn panels onto `<app-confirm-panel>`.** This
  slice makes them share a *palette*; they keep their own markup (different radius, different
  button). The componentisation is a separate refactor — a follow-up issue, not "while I'm here".
- **Touching classes T, F, R or S.** The `#9a6410` confirm-button literal sitting inside the two
  repainted panels is class T and stays literal; this slice does not widen into it.
- **The 48-member white inset-highlight ramp** (class R, open) — a different palette pass.
- **Changing any alpha that is already on the ladder** merely because it is close to a neighbour.
  `/25` and `/30` both survive; the ladder is the rule, not "fewest distinct values".
- **Adding a dark branch to any of these tokens.** All stay declared once.

## Behavior-parity ledger

> The slice repaints six existing surfaces. Nothing here changes behaviour — but per the
> template that claim is aspirational until verified position by position, which is what this
> table does. "Pixels" is the only column allowed to say *changed*.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `shared/confirm-panel` renders an amber `alertdialog`, focuses its confirm button on entry (WCAG 2.4.3) | preserved | untouched markup; only the token *names* change (`--riv-confirm-warn-*` → `--riv-warn-*`), values identical → **zero pixel movement** |
| `confirm-panel.spec.ts` asserts the three class names | changed (test only) | assertions renamed to the merged token; same three positions, same element |
| `daily-view-tab` close-sales confirm panel: amber edge + tint fill | **changed (pixels)** | edge `#d9861a/40`→`#e0a03a/60`, fill `#f0aa2e/10`→ opaque `#fff4e0`. Body ink AA 14.16:1 → 13.84:1, both far past AA |
| `payouts-tab` weather-refund confirm panel: same skin | **changed (pixels)** | identical move; the two were already byte-identical to each other and stay so |
| `daily-view-tab` close-sales **trigger button** edge `/50` | **changed (pixels)** | `#d9861a/50`→`#e0a03a/50`; edge-vs-fill 1.65:1 → 1.48:1, both sub-3:1 → newly recorded under non-text-contrast **rule 2** (label carries identity at 15.0:1), AC-7 |
| Legal pages' draft banner + `withheld-email-notice`: `role="note"`, no border, opaque amber fill | preserved (semantics) / **changed (pixels)** | `#fcf0d9`→`#fff4e0`, ink `#8a5410`→`#7a4a08`; contrast **improves** 5.54:1 → 6.86:1. No border on these, so no 1.4.11 question |
| `--riv-notice-banner-*` theme-invariance (#868): amber stays amber under `dark`/`riviera` | preserved | merged token is declared **once** in the base block, same as before; #868's fixed-fill-pins-its-ink rationale is carried onto the merged declaration verbatim — it is now the family's *primary* ground, since class O's "unreachable dark branch" argument does not cover tourist pages |
| `beach-cell` walk-in hatch 30%/12%; `layout-editor` swatch 35%/12% (comment claims mirror); `daily-view` tile 28%/10% ×2 | **changed (pixels)** | all three → one `--riv-walkin-hatch` at 30%/10%. The mirror comment becomes true rather than aspirational |
| `beach-cell` aisle boundary at `/55`, 3:1 over the canvas wash | preserved | already on the ladder; explicitly exempted and re-asserted (AC-3) |
| `payout-statement` table/chip/empty-state chrome at 7 distinct alphas | **changed (pixels)** | onto the ladder; max channel delta **7/255** |
| Every `data-testid`, `role`, `aria-*` and inert marker class on all six surfaces | preserved | no markup restructuring in any phase; only class *values* change |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The amber merge repaints **tourist-facing** legal pages + booking notice — surfaces #879 never scoped | high (certain) | med | Scope widening is the maintainer's explicit answer to the plan-gate question, recorded here. AA measured in the *improving* direction (5.54→6.86); e2e forces a dark document theme to prove the fixed pair still holds | maintainer | accepted at plan gate |
| R-2 | The merged token's theme-invariance loses its justification: class O's ground ("every consumer is under the porcelain-pinned console") is **false** for legal pages | med | high | Carry #868's ground onto the merged declaration and make it primary; keep the single-declaration guard; the dark-document e2e is the proof that survives a later override | agent | open |
| R-3 | A `toHaveCSS` elsewhere in the suite pins an outgoing literal and fails silently late (full-suite-only, the #122/#127 shape) | med | med | Grep the whole `e2e/` + `src/` tree for each outgoing value before each phase's commit; CI's mocked e2e is the backstop, checked per push | agent | open |
| R-4 | Retiring three token names leaves dangling prose references (`cta-border-token-skin.e2e.ts:7`, `legal-pages.contrast.spec.ts:22` name `--riv-notice-banner-*` in comments) | high | low | Both listed in File structure; `riviera-docs-freshness` at close-out is the second net | agent | open |
| R-5 | The ladder assertion is written so it passes vacuously (the emptied-guard trap #852 already hit once) | med | high | A companion meta-test asserting the ladder matcher *rejects* an off-ladder alpha — the same pairing `class-o-tint-tokens.contrast.spec.ts` already uses for its form sweep | agent | open |
| R-6 | `check-plan-file-structure.mjs` fails on an unlisted path | med | low | Run `node scripts/check-plan-file-structure.mjs --diff origin/main` before every push, with this doc **staged** | agent | open |
| R-7 | No Flyway number to claim, no backend, no money, no availability write | — | — | N/A by construction | — | closed |

## Open questions / Assumptions

- **Assumption:** the porcelain page background composites to effectively white under the
  console's card glass, so the before/after channel deltas computed at plan time
  (max 7/255) are the true ones. *Owner:* agent · *Resolves by:* phase 0 — the e2e reads real
  computed styles, which supersede the arithmetic.

### Resolved

- **Which alpha scale?** → **multiples of five**, maintainer's call at the plan gate. Chosen
  because every other class-O alpha already sits on it, so it moves 8 sites by ≤3 points and
  `beach-cell`'s load-bearing `/55` needs no exemption from the *rule* (only a named note).
- **The four ambers?** → **merge three, keep one apart.** `--riv-warn-*`, `--riv-confirm-warn-*`
  **and** `--riv-notice-banner-*` become one `--riv-warn-{edge,fill,ink}` family (maintainer chose
  the wider option, folding notice-banner in). `--riv-premium-edge` stays out: it is a beach-map
  **tier identity** over a gold gradient, not a warning — role before value, the fork #848/#858/#864
  each resolved this way.
- **Merged amber values?** → `#e0a03a` / `#fff4e0` / `#7a4a08` (confirm-panel's). Picked over
  notice-banner's `#fcf0d9`/`#8a5410` because it is the *higher*-contrast pair (6.86 vs 5.54),
  so every moved surface moves in the safe direction.
- **The name?** → `--riv-warn-*`. Verified honest across all six surfaces by reading the copy:
  the legal banner is "Draft… not final", the booking one "We couldn't email you… save it".
  Both are cautions carrying `role="note"`, not neutral information.
- **Walk-in hatch?** → **one `--riv-walkin-hatch` image token** at 30%/10%, the
  `--riv-premium-grad` precedent (#852): one declaration is the only thing that keeps a mirror
  mirroring.

## Availability & concurrency (invariant #2)

N/A — presentation-only. No write path to `availability(set_id, booking_date)` is touched, no
booking, payment or cutoff logic is read or changed. `beach-cell` and `daily-view-tab` render
availability state but this slice only changes the *colour* of already-computed states; the
`CellState` mapping and every `data-state` hook are untouched (Behavior-parity ledger, last row).

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No file under `platform/` is touched.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. `payouts-tab`'s weather-refund **confirm panel** is repainted; the
refund *action* behind it, its ledger reversal and its server-side policy are untouched.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `src/tailwind.css` | existing | token registry | — | — |
| FE-2 | `operator/payout-statement.ts` | existing | inline-template component | signals | — |
| FE-3 | `operator/set-editor.html`, `requests-tab.html` | existing | templates | signals | — |
| FE-4 | `operator/beach-cell.ts` | existing | variant **directive** | `computed()` class map | — |
| FE-5 | `operator/layout-editor.ts`, `daily-view-tab.ts`/`.html` | existing | components | signals | — |
| FE-6 | `shared/confirm-panel.ts` | existing | standalone component (`alertdialog` host) | `input()`/`output()` | — |
| FE-7 | `booking/withheld-email-notice.ts` | existing | standalone component | — | — |
| FE-8 | `pages/legal/terms-of-service.html`, `privacy-policy.html` | existing | templates | — | — |

**Standards:** no new components, no new DI, no new routes — every edit is a class-expression or
token-value change inside an existing standalone component/directive. Tailwind idioms per
`riviera-tailwind`: no `@apply`, `text-[14px]`-style arbitrary sizes untouched, the image token
consumed as `bg-(image:--riv-walkin-hatch)` (never bare `bg-(--x)`, which is a *colour*).

## FE↔BE contract

N/A — no contract change. No endpoint, DTO or wire shape is read or altered.

## Execution status

**Stage pointer:** `plan — authored, awaiting first phase`

**Next action:** Load `riviera-local-debug`, then start phase 0 by adding the red ladder
assertion + its meta-test to `shared/class-o-tint-tokens.contrast.spec.ts`.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — The ladder: every class-O alpha a multiple of 5 | | |
| 1 — One walk-in hatch (`--riv-walkin-hatch`) | | |
| 2 — One amber family (`--riv-warn-*`), three tokens retired | | |
| 3 — Ledger, rule-2 table, close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `docs/plans/class-o-alpha-normalisation.md` — this plan
- `docs/design/colour-literal-token-audit.md` — class-O section: the chosen scale beside rule B, the per-site before/after table, the named exemption (AC-8)
- `docs/design/non-text-contrast.md` — rule-2 family table gains the close-sales trigger button (AC-7)
- `frontend/src/tailwind.css` — the ladder comment, `--riv-walkin-hatch`, the merged `--riv-warn-*` family, three retired tokens
- `frontend/src/testing/glass-tokens.ts` — `CLASS_O_TINTS` rows, `NOTICE_BANNER_*` constants
- `frontend/src/app/shared/class-o-tint-tokens.contrast.spec.ts` — ladder sweep + meta-test, hatch sweep, retired-token sweep (AC-1, AC-4, AC-5)
- `frontend/src/app/operator/payout-statement.ts` — 6 ladder moves
- `frontend/src/app/operator/set-editor.html` — `select-tint/12` → `/10`
- `frontend/src/app/operator/requests-tab.html` — `positive-tint/12` → `/10`
- `frontend/src/app/operator/beach-cell.ts|.spec.ts` — hatch → token; `/55` exemption re-asserted (AC-3)
- `frontend/src/app/operator/layout-editor.ts` — swatch hatch → token
- `frontend/src/app/operator/daily-view-tab.ts|.html` — tile + legend hatch → token; warn panel + trigger button repaint
- `frontend/src/app/operator/daily-view-tab.contrast.spec.ts` — the rule-2 assertion for the trigger button (AC-7)
- `frontend/src/app/operator/payouts-tab.html` — warn panel repaint
- `frontend/src/app/shared/confirm-panel.ts|.spec.ts` — merged token names
- `frontend/src/app/booking/withheld-email-notice.ts|.contrast.spec.ts` — merged token; the AA before/after assertion (AC-6)
- `frontend/src/app/pages/legal/terms-of-service.html` — merged token
- `frontend/src/app/pages/legal/privacy-policy.html` — merged token
- `frontend/src/app/pages/legal/legal-pages.contrast.spec.ts` — retired-name prose reference (R-4)
- `frontend/e2e/class-o-tint-tokens.e2e.ts` — registry map, the ladder + hatch paint assertions (AC-2, AC-4)
- `frontend/e2e/notice-banner-token-skin.e2e.ts` — merged token, forced-dark proof (R-2)
- `frontend/e2e/cta-border-token-skin.e2e.ts` — retired-name prose reference (R-4)

---

## Phase 0 — The ladder: every class-O alpha a multiple of 5

**Files:** Modify `frontend/src/app/shared/class-o-tint-tokens.contrast.spec.ts` · `frontend/src/app/operator/payout-statement.ts` · `frontend/src/app/operator/set-editor.html` · `frontend/src/app/operator/requests-tab.html` · `frontend/src/app/operator/beach-cell.spec.ts` · `frontend/e2e/class-o-tint-tokens.e2e.ts`

- [ ] **Step 1: Write the failing test** — the ladder sweep plus the meta-test that proves it can
      fail (R-5). Enumerates by **mechanism** (`-riv-<class-O token>/<alpha>` anywhere in app
      sources), not by the sites already known.
- [ ] **Step 2: Run it, verify it fails** — `npm test -- class-o-tint-tokens` → FAIL naming the 8
      off-ladder positions (`console-tint/4 ×2`, `/7`, `/12`, `/14 ×2`, `select-tint/6`, `/12`,
      `positive-tint/12`).
- [ ] **Step 3: Minimal implementation** — move exactly those alphas: `/4→/5`, `/7→/10`,
      `/12→/15` (console-tint outer border), `/14→/15`, `select-tint /6→/5`, `/12→/10`,
      `positive-tint /12→/10`. **Do not touch** `/15`, `/20`, `/25`, `/30`, `/40`, `/45`, `/50`,
      `/55`, `/60`.
- [ ] **Step 4: Run it, verify it passes** — `npm test -- class-o-tint-tokens beach-cell payout-statement` → PASS
- [ ] **Step 5: Generalization-audit pass** — population: *every* `/opacity` position in app
      sources, not just the class-O tokens' (an off-ladder alpha on `bg-white/85` would be
      invisible to a token-scoped sweep). Enumerate, then decide whether the ladder is class-O-only
      or tree-wide, and record the decision.
- [ ] **Step 6: Commit** — `git commit -m "Put every class-O alpha on the multiple-of-five ladder (#879)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — One walk-in hatch

**Files:** Modify `frontend/src/tailwind.css` · `frontend/src/app/operator/beach-cell.ts|.spec.ts` · `frontend/src/app/operator/layout-editor.ts` · `frontend/src/app/operator/daily-view-tab.ts|.html` · `frontend/src/app/shared/class-o-tint-tokens.contrast.spec.ts` · `frontend/e2e/class-o-tint-tokens.e2e.ts`

- [ ] **Step 1: Write the failing test** — a sweep asserting no app source rebuilds a
      `repeating-linear-gradient(45deg,…--riv-console-tint…)` inline, plus the single-declaration
      guard for `--riv-walkin-hatch` (AC-4).
- [ ] **Step 2: Run it, verify it fails** — `npm test -- class-o-tint-tokens` → FAIL listing
      `beach-cell.ts`, `layout-editor.ts`, `daily-view-tab.ts`, `daily-view-tab.html`.
- [ ] **Step 3: Minimal implementation** — declare `--riv-walkin-hatch` at 30%/10% beside
      `--riv-premium-grad` (same rationale paragraph), consume it as
      `bg-(image:--riv-walkin-hatch)` at all four sites; delete the now-false "mirrors the cell
      variants" caveat in `layout-editor.ts` since it becomes true.
- [ ] **Step 4: Run it, verify it passes** — `npm test -- class-o-tint-tokens beach-cell layout-editor daily-view-tab` → PASS
- [ ] **Step 5: Generalization-audit pass** — population: every *image* the tree builds inline
      that a token could own (mechanism: `bg-[` + `gradient(`), not just the 45deg hatch.
- [ ] **Step 6: Commit** — `git commit -m "Give the walk-in hatch one declaration, so the mirrors mirror (#879)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — One amber family

**Files:** Modify `frontend/src/tailwind.css` · `frontend/src/testing/glass-tokens.ts` · `frontend/src/app/shared/confirm-panel.ts|.spec.ts` · `frontend/src/app/operator/daily-view-tab.html` · `frontend/src/app/operator/daily-view-tab.contrast.spec.ts` · `frontend/src/app/operator/payouts-tab.html` · `frontend/src/app/booking/withheld-email-notice.ts|.contrast.spec.ts` · `frontend/src/app/pages/legal/*.html` · `frontend/e2e/notice-banner-token-skin.e2e.ts` · `frontend/e2e/class-o-tint-tokens.e2e.ts`

- [ ] **Step 1: Write the failing test** — the merged-family declaration guard + the
      retired-token sweep (AC-5), the AA before/after assertion (AC-6), and the rule-2
      trigger-button assertion (AC-7).
- [ ] **Step 2: Run it, verify it fails** — `npm test -- class-o-tint-tokens withheld-email-notice daily-view-tab` → FAIL: `--riv-warn-fill` undeclared, three retired tokens still present.
- [ ] **Step 3: Minimal implementation** — declare `--riv-warn-{edge,fill,ink}` =
      `#e0a03a`/`#fff4e0`/`#7a4a08` with **#868's** fixed-fill rationale as the primary ground
      (R-2); delete `--riv-warn-tint`, `--riv-confirm-warn-*`, `--riv-notice-banner-*`; repaint the
      six surfaces; take each panel's class expression **whole** (#858's rule) so no named utility
      is left beside a literal.
- [ ] **Step 4: Run it, verify it passes** — `npm test -- confirm-panel withheld-email-notice legal-pages daily-view-tab payouts-tab class-o-tint-tokens` → PASS, then `npm run test:e2e:a11y -- class-o-tint-tokens notice-banner-token-skin` → PASS
- [ ] **Step 5: Generalization-audit pass** — population: every token pair in `tailwind.css` whose
      declared values are within a small ΔE of another pair's (mechanism: compare all declared
      hex values pairwise), not just the ambers the issue listed.
- [ ] **Step 6: Commit** — `git commit -m "Merge the amber treatments into one warn family (#879)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — Ledger, rule-2 table, close-out

**Files:** Modify `docs/design/colour-literal-token-audit.md` · `docs/design/non-text-contrast.md` · `frontend/src/app/pages/legal/legal-pages.contrast.spec.ts` · `frontend/e2e/cta-border-token-skin.e2e.ts` · this plan

- [ ] **Step 1** — Record the ladder beside rule B in § Class O, with the per-site before/after
      table (AC-8) and `/55` named as the exemption.
- [ ] **Step 2** — Add the close-sales trigger button to `non-text-contrast.md`'s rule-2 family
      table with its measuring spec (AC-7).
- [ ] **Step 3** — Fix the two dangling `--riv-notice-banner-*` prose references (R-4).
- [ ] **Step 4** — `node scripts/check-plan-file-structure.mjs --diff origin/main` (this doc staged) → PASS
- [ ] **Step 5: Commit** — `git commit -m "Record the class-O alpha ladder and the amber merge (#879)"`

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `npm test -- class-o-tint-tokens` → ladder sweep + meta-test PASS.
- [ ] **AC-2:** `npm run test:e2e:a11y -- class-o-tint-tokens` → all 8 moved positions assert their new computed colour.
- [ ] **AC-3:** `npm test -- beach-cell` → `/55` asserted, named load-bearing.
- [ ] **AC-4:** `npm test -- class-o-tint-tokens` + e2e → one hatch declaration, no inline rebuild.
- [ ] **AC-5:** `npm test -- class-o-tint-tokens` → merged family declared, three retired tokens absent.
- [ ] **AC-6:** `npm test -- withheld-email-notice` → ≥ 4.5:1, and above the outgoing ratio.
- [ ] **AC-7:** `npm test -- daily-view-tab` → rule-2 conditions asserted; table row present.
- [ ] **AC-8:** review-gate read of § Class O + `riviera-docs-freshness` at close-out.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [ ] **Availability** section filled (justified N/A); invariant #2 untouched.
- [ ] Pool + cutoff rules honored (invariants #3, #4) — N/A, no logic touched.
- [ ] **Modulith** section filled (N/A — frontend-only).
- [ ] **Payment/payout** section filled (N/A).
- [ ] Refund policy enforced server-side (invariant #10) — untouched.
- [ ] Timezone correct (invariant #6) — N/A.
- [ ] Booking codes unguessable (invariant #7) — N/A.
- [ ] Flyway migration present for schema changes (invariant #12) — N/A, no schema change.
- [ ] **Frontend** standards met; no `as any`; Tailwind idioms per `riviera-tailwind`.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty.
- [ ] **Close-out written in THIS PR**, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — the `references/pr-gates.md` §1 ladder *plus* `riviera-review-overlay`.
