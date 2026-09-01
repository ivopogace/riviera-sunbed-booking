# CTA border token (`--riv-cta-border`) Implementation Plan

**Goal:** Retire the 17 `rgba(255,255,255,0.4)` literals in `auth/`, `booking/` and `shared/`
by registering **one new border token** for the 16 that are a white hairline on a *fixed* teal
action surface, and migrating the single `bg-` site onto the existing `--riv-inset-fill` —
which also repairs a dark-theme AA failure that literal was causing.

**Architecture:** The single significant decision is that the new border token is
**theme-invariant, declared once**, and *not* modelled on `--riv-card-border` as issue #853
suggested. `--riv-card-border` themes because the card glass under it themes; every one of these
16 borders sits on a surface that does **not** theme (`--riv-cta-grad`, declared once in the base
block and inherited by all three themes, and `booking-dialog`'s `#31798a` close button). That is
the class-F rule the ledger already records — a fixed surface pins everything painted on it — and
it is measured, not asserted: dark `--riv-card-border`'s white 0.16 over these fills is
**1.35–1.46:1**, i.e. the hairline all but disappears over a fill that never moves.

**Persistence:** N/A — frontend styling only; no tables, no migrations (invariants #1/#12 untouched).

**Source of intent:** GitHub issue [#853](https://github.com/ivopogace/riviera-sunbed-booking/issues/853)
(class **R**, row 1 of `docs/design/colour-literal-token-audit.md`); parent epic #836.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught the
15/2 → 16/1 miscount, the wrong `--riv-card-border` precedent, and the AC's over-broad
"no literal remains" wording) · `riviera-plan-doc` (this template — forced the behavior-parity
ledger, which is where the dark-theme `<dl>` AA failure surfaced) · `tdd` (each phase is red at the
e2e/unit seam named in its AC before the migration lands) · `riviera-review-overlay` (review gate —
runs at ready-for-review) · `riviera-docs-freshness` (**ran** — see merge close-out, step 5) ·
`riviera-tailwind` (the theme-invariant-token rule, "consume through the named utility", and the
family-by-form cut that keeps the inset-highlight shadows out) · `riviera-frontend` (token registry
lives in `tailwind.css` + `@theme inline`; the cross-folder guard spec belongs in `shared/`) ·
`playwright-cli` + `riviera-review-overlay` RV-FE-E2E (the render proof is a **mocked** e2e in
`frontend/e2e/`, not the real-backend suite) · `riviera-local-debug` (scoped `npm test` /
`PW_CHROMIUM_EXECUTABLE=…` for the mocked e2e in a cloud session).

**Branch:** `claude/sdlc-853-jciimj` — the cloud session's designated branch **stands in for**
`feature/cta-border-token` (`riviera-sdlc` § Remote/cloud session addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given `src/tailwind.css`, when the stylesheet is read as text, then
      `--riv-cta-border` is declared **exactly once**, in the base
      (`:root, [data-riv-theme='porcelain']`) block, at `rgba(255, 255, 255, 0.4)` — no theme
      block overrides it. *Seam:* the `tailwind.css` source, via `testing/stylesheet-tokens`
      (`baseBlock` / `declarationsOf`) · *Pinned by:*
      `cta-border-token.contrast.spec.ts` › "is declared once, in the base block".

- [ ] **AC-2:** Given the token composited over each surface it lands on (`--riv-cta-grad`'s two
      stops `#0c7288`/`#0a5f74` and the dialog close button's `#31798a`), when its contrast against
      that fill is computed, then every value is **below** WCAG 1.4.11's 3:1 and the number is
      recorded — this border is decorative chrome, not the affordance boundary, and is exempt for a
      *measured* reason, the `--riv-solid-btn-border` precedent. *Seam:* `testing/contrast`
      composited maths over the `testing/glass-tokens` mirror · *Pinned by:*
      `cta-border-token.contrast.spec.ts` › "is decorative chrome, measured rather than assumed".

- [ ] **AC-3:** Given the themed alternative issue #853 proposed (`--riv-card-border`), when its
      **dark** value is composited over the same three fixed fills, then it measures ≤ 1.5:1 —
      the bound that makes the single declaration a decision rather than an omission. *Seam:* as
      AC-2 · *Pinned by:* `cta-border-token.contrast.spec.ts` › "a themed border would fade over
      fills that do not theme".

- [ ] **AC-4:** Given the sign-in page rendered in a real browser, when the theme is porcelain
      **and** when the document theme is forced to `dark`, then the primary submit button's
      computed `border-color` is `rgb(255, 255, 255)` at alpha `0.4` in both — proving the
      `@theme inline` row generated the utility and that the value does not move.
      *Seam:* the rendered page at `/account/sign-in` (`getByTestId('auth-submit')`) ·
      *Pinned by:* `e2e/cta-border-token-skin.e2e.ts`.

- [ ] **AC-5:** Given `booking-confirmation`'s summary `<dl>` in the **dark** theme, when its fill
      comes from `--riv-inset-fill` rather than the white-0.4 literal, then its two inks clear AA
      4.5:1 over every dark background stop (they measure **3.12–3.29:1** and **2.62–2.81:1**
      today — a live failure). *Seam:* `testing/contrast` composited maths over the
      `testing/glass-tokens` mirror · *Pinned by:*
      `booking-confirmation.contrast.spec.ts` › "the summary list's inset fill clears AA in the
      dark theme".

- [ ] **AC-6:** Given the whole `frontend/src` tree, when the audit ledger's own population command
      is run for this value, then **no** `rgba(255,255,255,0.4)` remains in a
      `(text|bg|border|fill|stroke|shadow)-[…]` position outside `*.spec.ts`. *Seam:* the working
      tree, by grep · *Pinned by:* the AC-verification command below (a grep, recorded with its
      output — deliberately not a new lint rule; the ledger defers that to #836 step 4).

- [ ] **AC-7:** Given `docs/design/colour-literal-token-audit.md`, when this PR merges, then class
      **R** row 1 reads `done` with this PR number, its miscounted split is corrected in place, and
      the residue this slice deliberately does not take carries its own row. *Seam:* the ledger file
      · *Pinned by:* review (no test — it is a document).

## Non-goals

- **The inset-highlight shadows.** `app.html:161`'s `shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]`
  holds this value too, so AC-6's wording in the issue ("no literal remains") technically reaches
  it. It is deliberately **out of scope**: a different role (an inner highlight inside a composite
  shadow, not a border), a different folder (the app shell, outside the issue's three), and it is
  not in the ledger's population at all — the population regex requires `#`/`rgba(` immediately
  after `[`. It is also one member of a three-value ramp (0.4 / 0.5 / 0.7) used in the same idiom
  across the tree, so tokenising this member alone is exactly the partial cut the ledger warns
  against. Recorded as a new ledger row instead.
- **The `rgba(255,255,255,0.6)` white borders.** A neighbouring family (it equals light
  `--riv-card-border`) that `testing/glass-tokens.ts` currently mis-attributes to *this* issue.
  Its pointer is corrected and the family gets its own ledger row; migrating it is not this slice.
- **Retuning the CTA gradient.** AC-2's maths surfaced that in the **dark** theme the CTA fill
  itself sits at 2.23–3.54:1 against the dark card glass (both light themes clear 3:1 comfortably —
  3.40–7.24). That is the fill's boundary question, not the border's, and it is the same
  glass-aesthetic finding `--riv-solid-btn-*` and `--riv-accent-*` already record against tracking
  issue **#834**. Recorded, not fixed here.
- No component restructuring, no new directive, no touch-target or focus changes.

## Behavior-parity ledger

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| 16 sites paint a `rgba(255,255,255,0.4)` border in all three themes | **preserved** (byte-identical) | `border-riv-cta-border`, declared once at the same value — the light-theme paint and all three themes' paint are unchanged |
| `booking-confirmation`'s `<dl>` paints a `rgba(255,255,255,0.4)` fill in all three themes | **changed** | Now `bg-riv-inset-fill`: identical in the two light themes (both 0.4), **white 0.08 in the dark theme**. Deliberate — the literal was leaving that list's inks at 2.62–3.29:1, below AA; its four sibling inset panels in the same components already use this token |
| `booking-confirmation`'s `<dl>` keeps its `rgba(255,255,255,0.6)` border | **preserved** | Untouched — a different value and a different family (see Non-goals) |
| Every migrated element keeps its radius, padding, shadow, focus ring and transition | **preserved** | Only the colour position changes in each class string; the e2e reads computed style, not the class list |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A token declared without its `@theme inline` row generates **no utility**: the class stays in the markup and the paint silently reverts to the browser default. No unit spec can see this | med | high | AC-4's mocked e2e reads the computed `border-color` on a real render — the ledger's own step 4 | agent | open |
| R-2 | Someone later adds a `--riv-cta-border` dark override, silently restyling 16 buttons; every contrast ratio in the guard would still pass, because they are computed from the mirror | med | med | AC-1's single-declaration guard reads `tailwind.css` **as text** (`testing/stylesheet-tokens`), plus AC-4's forced-dark e2e where the cascade decides | agent | open |
| R-3 | The `bg-` site is *not* really `--riv-inset-fill` and the migration restyles it | low | med | Judged individually (issue AC 1): it is a translucent white inset block on the themed card glass, 17 lines above a sibling that already uses the token in the same component. AC-5 measures the outcome rather than assuming it | agent | open |
| R-4 | The 16 borders are not one family — the dialog close button sits on `#31798a`, not the gradient | low | med | Same **form** (a white hairline bevel on a fixed teal action surface) and the same theme-invariance ground; AC-2 measures all three fills, not just the gradient. Grouping by form rather than value is the ledger's own rule | agent | open |
| R-5 | Merge conflict with a sibling `#836` slice touching `tailwind.css` / `glass-tokens.ts` | med | low | Both are append-mostly; merge `origin/main` before ready-for-review. No Flyway number is in play (frontend-only slice) | agent | open |

## Open questions / Assumptions

- **Assumption:** `--riv-cta-grad` is genuinely theme-invariant, so the border on it must be too —
  *Resolves by:* phase 0 (`declarationsOf('--riv-cta-grad')` returns exactly one entry; asserted
  alongside AC-1).
- **Assumption:** naming the token `--riv-cta-border` (beside `--riv-cta-grad`) rather than after
  the close button's own teal is the right cut, the close button being the same bevel on the same
  kind of surface — a naming call the plan-doc skill leaves to the implementer. *Resolves by:*
  the review gate.

### Resolved

- **Open question (issue drift, closed at intake):** the issue and the ledger both say "15 of 17
  borders; 2 are `bg-`". The ledger's own population command returns **16 borders and 1 `bg-`**.
  Planned against the enumeration, and the ledger row is corrected in this PR (AC-7).
- **Open question (issue drift, closed at intake):** the issue names `--riv-card-border` as "the
  closest existing precedent for how such a border themes". Rejected on evidence — see
  *Architecture* and AC-3.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. No booking, beach-map or `availability` code is touched; the
slice changes colour positions in class strings and one CSS token block.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No file under `platform/` is touched.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. `booking-pay.ts` is touched only at a `border-` colour position.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `src/tailwind.css` | existing | token registry (`@theme inline` row + base-block declaration) | — | — |
| FE-2 | 15 CTA-gradient sites in `auth/` (6), `booking/` (8), `shared/` (1) | existing | class strings only | unchanged | unchanged |
| FE-3 | `booking/booking-dialog.ts:85` — the close button on `#31798a` | existing | class string only | unchanged | unchanged |
| FE-4 | `booking/booking-confirmation.ts:52` — the summary `<dl>` | existing | class string only | unchanged | unchanged |
| FE-5 | `src/testing/glass-tokens.ts` | existing | the one test-side token mirror | — | — |
| FE-6 | `shared/cta-border-token.contrast.spec.ts` | new | Vitest guard spec | — | — |
| FE-7 | `e2e/cta-border-token-skin.e2e.ts` | new | mocked Playwright spec (CI-safe suite) | — | — |

**Standards:** no component logic changes; every migrated position consumes the token through its
**named utility** (`border-riv-cta-border`, `bg-riv-inset-fill`), never `var(--riv-*)` in an
arbitrary value — `riviera-tailwind` rule "tokens do the switching". The guard spec lives in
`shared/` because the family spans three feature folders and `shared/` is the neutral home
(`riviera-frontend` § folder taxonomy).

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** `implement (phase 1)`

**Next action:** Phase 1 — write `e2e/cta-border-token-skin.e2e.ts` plus the two sweep tests red,
then migrate the 16 border sites onto `border-riv-cta-border`.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Register the token + its guard spec | ✅ | see phase-0 commit |
| 1 — Migrate the 16 border sites + the render proof | ⏳ | |
| 2 — Migrate the `bg-` site onto `--riv-inset-fill` | | |
| 3 — Ledger + mirror close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `docs/plans/cta-border-token.md` — this plan.
- `docs/design/colour-literal-token-audit.md` — class R row 1 → `done`; the corrected split; the
  two residue rows (the inset-highlight ramp, the white-0.6 border family).
- `frontend/src/tailwind.css` — the `@theme inline` row and the base-block declaration with its
  reason.
- `frontend/src/testing/glass-tokens.ts` — the `CTA_BORDER` mirror + the three fixed fills it lands
  on; the corrected `#853` pointer in the medallion-border comment.
- `frontend/src/app/shared/cta-border-token.contrast.spec.ts` — the declaration, exemption and
  themed-alternative guards.
- `frontend/e2e/cta-border-token-skin.e2e.ts` — the computed-style proof, porcelain + forced dark.
- `frontend/src/app/booking/booking-confirmation.contrast.spec.ts` — AC-5's dark-theme AA record.
- `frontend/src/app/auth/{auth-page,forgot-password,operator-password,reset-password,set-password}.ts` — border sites.
- `frontend/src/app/booking/{booking-confirmation,booking-dialog,booking-pay,booking-view,find-booking,manage-booking-link,my-bookings,request-confirmation}.ts` — border sites (+ the one `bg-` site).
- `frontend/src/app/shared/retry-button.ts` — border site.

---

## Phase 0 — Register the token + its guard spec

**Files:** Create `frontend/src/app/shared/cta-border-token.contrast.spec.ts` · Modify
`frontend/src/tailwind.css`, `frontend/src/testing/glass-tokens.ts`

- [ ] **Step 1:** Write `cta-border-token.contrast.spec.ts` — the single-declaration guard (AC-1),
      the measured-exemption record (AC-2), and the themed-alternative bound (AC-3), all sourcing
      values from `testing/glass-tokens.ts`.
- [ ] **Step 2:** `npx vitest run src/app/shared/cta-border-token.contrast.spec.ts` → FAIL
      (`--riv-cta-border` has no declaration).
- [ ] **Step 3:** Add `--color-riv-cta-border: var(--riv-cta-border);` to `@theme inline` and
      `--riv-cta-border: rgba(255, 255, 255, 0.4);` to the base block beside `--riv-cta-grad`, with
      the reason at the declaration.
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5:** Generalization-audit pass (below).
- [ ] **Step 6/7:** Commit + update this section.

## Phase 1 — Migrate the 16 border sites + the render proof

**Files:** Create `frontend/e2e/cta-border-token-skin.e2e.ts` · Modify the 14 component files

- [ ] **Step 1:** Write the e2e (AC-4): the declaration+utility-generation test, the porcelain
      render, and the forced-`dark` render.
- [ ] **Step 2:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test
      --config playwright.a11y.config.ts cta-border-token-skin` → FAIL (the utility does not exist
      on the element; the literal is still painted).
- [ ] **Step 3:** Replace `border-[rgba(255,255,255,0.4)]` with `border-riv-cta-border` at all 16
      positions.
- [ ] **Step 4:** Same command → PASS.
- [ ] **Steps 5–7:** As phase 0.

## Phase 2 — Migrate the `bg-` site onto `--riv-inset-fill`

**Files:** Modify `frontend/src/app/booking/booking-confirmation.ts`,
`frontend/src/app/booking/booking-confirmation.contrast.spec.ts`,
`frontend/e2e/cta-border-token-skin.e2e.ts`

- [ ] **Step 1:** Add AC-5's dark-theme AA assertion to `booking-confirmation.contrast.spec.ts`
      (the inks over the inset fill), and the `<dl>`'s computed-background case to the e2e.
- [ ] **Step 2:** Run both → the e2e case FAILS (the literal paints `rgba(255, 255, 255, 0.4)`
      under a dark theme).
- [ ] **Step 3:** Replace `bg-[rgba(255,255,255,0.4)]` with `bg-riv-inset-fill`.
- [ ] **Step 4:** Re-run → PASS.
- [ ] **Steps 5–7:** As phase 0.

## Phase 3 — Ledger + mirror close-out

**Files:** Modify `docs/design/colour-literal-token-audit.md`,
`frontend/src/testing/glass-tokens.ts`, `docs/plans/cta-border-token.md`

- [ ] **Step 1:** Mark class R row 1 `done — #853, PR #NN`, correct the 15/2 split to 16/1, and add
      the two residue rows.
- [ ] **Step 2:** Correct the `#853` pointer in the `MEDALLION_NEGATIVE_BORDER` comment.
- [ ] **Step 3:** `node scripts/check-plan-file-structure.mjs --diff origin/main` → clean.
- [ ] **Step 4:** Commit + finalize this Execution status.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1/2/3:** `npx vitest run src/app/shared/cta-border-token.contrast.spec.ts` → PASS.
- [ ] **AC-4:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.a11y.config.ts cta-border-token-skin` → PASS.
- [ ] **AC-5:** `npx vitest run src/app/booking/booking-confirmation.contrast.spec.ts` → PASS.
- [ ] **AC-6:** `grep -rnoE '(text|bg|border|fill|stroke|shadow)-\[rgba\(255, ?255, ?255, ?0\.4\)\]' frontend/src --include=*.ts --include=*.html` → no output.
- [ ] **AC-7:** ledger row reads `done` with this PR.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — N/A, no backend code.
- [ ] **Availability** section justified N/A (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — N/A.
- [ ] **Modulith** section justified N/A (invariant #11).
- [ ] **Payment/payout** section justified N/A (invariants #5, #8, #9).
- [ ] Refund policy (invariant #10) — N/A.
- [ ] Timezone (invariant #6) — N/A.
- [ ] Booking codes (invariant #7) — N/A.
- [ ] Flyway (invariant #12) — N/A, no schema change.
- [ ] **Frontend** standards met: named utilities, no fresh SCSS, no `as any`.
- [ ] Execution status at HEAD matches reality.
- [ ] Risk register has no stale `open` rows; Open Questions empty.
- [ ] **Close-out written in THIS PR**, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** per the invocation ladder plus `riviera-review-overlay`.
