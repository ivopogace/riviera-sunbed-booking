# Solid outline-button token family Implementation Plan

> **For agentic workers:** to implement this plan use `tdd` at the plan's named seams
> (`/implement` is the human's entry command — `riviera-sdlc`'s Implement row is the
> model's route). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the solid outline-button skin's five remaining colour positions — resting
fill, hover fill, neutral border, danger border, danger ink — onto `--riv-solid-btn-*`
tokens declared **once** in `tailwind.css`'s base block with no dark override, completing
the family `--riv-solid-btn-ink` opened at #835, without touching the out-of-family
`#a3372a` sites (seven positions across five files).

**Architecture:** The single significant decision is **theme-invariance as a family, not a
pair** — `riviera-tailwind` §Styling-across-the-themes tier 1's narrow exception, and the
same call #850 made for `--riv-form-error-*`. The fill does not theme, so nothing painted
over it may: a themed `--riv-danger-ink` resolves `#ffa9a1` in the dark theme and measures
**1.69:1** on the resting fill and **1.53:1** on the hover fill — light on light, the same
failure #850 measured at 1.54:1. Every token is therefore declared once in the base block
with the reason at its declaration, and the invariance itself — not just the ratios — is
what the tests protect.

**Persistence:** N/A — frontend-only, no backend or schema change (invariant #1 untouched).

**Source of intent:** GitHub issue #851 (class **F-2** of
`docs/design/colour-literal-token-audit.md`; parent #836). Sibling precedent: #850 / PR #857.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — **caught a
factual error in the issue's own "correction #2"**, see Open questions R-1) ·
`riviera-plan-doc` (this template — forced the Behavior-parity ledger, which is what turned
"is the `my-bookings` border a deliberate difference?" into a checkable row) · `tdd` (each
phase writes the failing spec first at the seams named below) · `riviera-review-overlay`
(review gate — due at ready-for-review) · `riviera-docs-freshness` (**ran** at merge
close-out over the PR's merge span — see Execution status) · `riviera-tailwind` (supplied
the whole pattern: tier-1 token switching, the theme-invariance exception and its
"reason at the declaration" rule, and `text-[14px]`-style idioms; also its "prove no drift
by diffing **computed styles**, not the class list" rule, which is why phase 3 is an e2e
and not another jsdom spec) · `riviera-frontend` (placement: the family spec is a
`booking/` colocated `*.contrast.spec.ts`, the e2e goes in the CI-safe `frontend/e2e/`
suite, and `src/testing/glass-tokens.ts` is the shared mirror) · `playwright-cli` (e2e
authoring — `toHaveCSS` on the computed box, `addInitScript` for the forced dark theme) ·
`riviera-local-debug` (scoped `npm test`/`test:e2e:a11y` runs, and the
`PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium` cloud recipe) · `angular-developer`
(**N/A — no component logic changed**: the diff is class strings and CSS custom properties, so
no signals/DI/control-flow API is in play. Named rather than omitted, per the RV-PROC-1 gap
#856's review flagged and #857 corrected the same way).

**Branch:** `claude/sdlc-851-g494xa` — **the cloud session's designated remote branch
stands in for `feature/solid-outline-button-token-family`** (`riviera-sdlc` §Remote/cloud
session addendum). The literal `feature/*` branch is deliberately not created.

---

## Acceptance criteria (testable)

> Frontend slice, so every AC names its seam explicitly.

- [x] **AC-1:** Given the five new tokens, when `tailwind.css` is read as text, then each is
      declared **exactly once** and that declaration sits in the base block
      (`:root, [data-riv-theme='porcelain']`), so no theme block can override it.
      *Seam:* `src/tailwind.css` as text (the `theme-boot.spec.ts` drift-guard pattern —
      jsdom maths cannot see an added dark override) · *Pinned by:*
      `solid-btn-tokens.contrast.spec.ts` › "declares each token exactly once" +
      "declares the family in the base block".
- [x] **AC-2:** Given both inks of the family, when composited on **both** the resting fill
      and the hover fill, then all four pairs clear WCAG AA (4.5:1) — measured 8.45 / 7.63
      (teal) and 6.17 / 5.58 (danger). *Seam:* `src/testing/contrast.ts` `contrastRatio`
      over `src/testing/glass-tokens.ts` · *Pinned by:*
      `solid-btn-tokens.contrast.spec.ts` › "both inks clear AA on both fills".
- [x] **AC-3:** Given the themed inks that were the alternative to inventing this family,
      when composited on the fixed fill, then they fall **below** AA — `--riv-danger-ink`
      at 1.69:1 and `--riv-accent-ink` at 1.52:1 — keeping the reason for the decision in
      the tree rather than only in a comment. *Seam:* same as AC-2 · *Pinned by:*
      `solid-btn-tokens.contrast.spec.ts` › "the themed inks would not — which is why the
      family exists".
- [x] **AC-4:** Given the whole `src/app` tree, when swept for this family's literals **by
      role** (`#f4f6f7`, `#e7ebec`, `text-[#a3372a]`, `border-[rgba(200,90,60,0.5)]`, and
      the outline buttons' `border-[rgba(255,255,255,0.7)]`), then no non-spec component
      file still paints one. *Seam:* `readdirSync(src/app, {recursive:true})` over
      `.ts`/`.html` · *Pinned by:* `solid-btn-tokens.contrast.spec.ts` › "leaves no
      component painting the family as a literal".
- [x] **AC-5:** Given the seven out-of-family `#a3372a` positions across five files, when the same sweep runs, then
      each is **still present** — the half that proves the sweep did not overreach.
      *Seam:* the same tree read, asserted positively by path ·
      *Pinned by:* `solid-btn-tokens.contrast.spec.ts` › "leaves the out-of-family
      `#a3372a` sites untouched".
- [x] **AC-6:** Given a real browser render, when the booking-view Cancel/Keep buttons are
      shown, then their computed `background-color`, `border-color` and `color` equal the
      registered values, the hover fill applies on hover, and **all of it is unchanged
      under a forced `dark` document theme**. *Seam:* the `/booking/:code` route in the
      mocked Playwright suite, read through `toHaveCSS` · *Pinned by:*
      `e2e/solid-btn-token-skin.e2e.ts`.
- [x] **AC-7:** Given each registered token, when the page loads, then the token resolves on
      `document.documentElement` **and** its `@theme inline` row generated the utility class
      — a token declared without its row generates no utility, so the class stays in the
      markup and the paint silently does not change. *Seam:* `document.styleSheets` walked
      for the utility selectors · *Pinned by:* `e2e/solid-btn-token-skin.e2e.ts` › "every
      registered token is declared and generates its utility".
- [x] **AC-8:** Given the audit ledger, when the F-2 row is read at merge, then it reads
      `done — #851, PR #NN`. *Seam:* `docs/design/colour-literal-token-audit.md` ·
      *Pinned by:* review (a doc row, not a test — stated so rather than faked with one).

## Non-goals

- **The out-of-family `#a3372a` positions — seven of them, across five files.** `shared/failure-panel.ts`,
  `operator/payouts-tab.ts:135`, `operator/daily-view-tab.html:352`,
  `booking/booking-pay.ts:210`, and `operator/payouts-tab.html:236` (an `/opacity` form —
  **#852's**, and tokenising it would change the computed value). AC-5 enforces this.
- **`booking-view.ts:100`'s `rgba(200,90,60,0.4)` solid `btnDanger` gradient button.** A
  *different* alpha on a *different* skin; near-miss values are exactly what a value-blind
  sweep swallows.
- **The other 13 `rgba(255,255,255,0.7)` sites** (shadow insets, panel fills, icon-circle
  borders). Only the three outline-button `border-` roles are this family's.
- **Extracting a shared TS constant across the three components.** `review-panel.ts`
  restates `BTN` deliberately — `booking-view` imports it, so reaching back would close a
  cycle. The **tokens** are the shared source of truth; that is what AC-4 asks for.
- Any dark/riviera override for this family — the whole point is that there is none.

## Behavior-parity ledger

> This is a restyle-only slice, so the claim "no visual change" is exactly the kind
> `riviera-plan-doc` says is aspirational until verified row by row.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `booking-view` / `review-panel` Cancel-Keep-Edit-Remove resting fill `#f4f6f7` | preserved | `bg-riv-solid-btn-fill`, same value |
| …their hover fill `#e7ebec` | preserved | `hover:bg-riv-solid-btn-hover`, same value |
| …their neutral border `rgba(255,255,255,0.7)` | preserved | `border-riv-solid-btn-border`, same value |
| …their danger border `rgba(200,90,60,0.5)` | preserved | `border-riv-solid-btn-danger-border` |
| …their danger ink `#a3372a` | preserved | `text-riv-solid-btn-danger-ink` |
| `my-bookings` `rowRetry` fill / hover / border | preserved | the **same three tokens** — see R-1: it was never a deviation |
| `border-[1.5px]` width on `BTN_OUTLINE` | preserved | untouched; a width, not a colour (and Chromium snaps it to `"1px"` in `getComputedStyle` — `riviera-tailwind` gotcha, do not chase) |
| `[transition:background_0.15s_ease]`, `motion-reduce:`, `focus-visible:` outline, `aria-disabled:` states | preserved | untouched by this slice; AC-6 reads only colour properties |
| Teal ink already on `--riv-solid-btn-ink` (#835) | preserved | untouched — this slice only adds its siblings |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | **The issue's "correction #2" is itself wrong** — it states `rgba(255,255,255,0.7)` "appears exactly once, inlined on `my-bookings.ts:205`" and asks which border `my-bookings` should carry. A grep shows it on **all three** outline buttons (`booking-view.ts:101`, `review-panel.ts:49`, `my-bookings.ts:205`): it sits on the `btnOutline` **variant**, not in the shared `BTN_OUTLINE` base, which is why reading the base alone missed it. Planning to the issue's text would have left a family-wide border untokenised and invented a fake divergence to "reconcile" | — | med | Treat the border as family-wide (`--riv-solid-btn-border`); AC-4 sweeps all three roles. The audit ledger's own F-2 row already lists this border as a family member with n=9 (3 fill + 3 hover + 3 border), so the ledger and the code agree and only the issue body drifted | agent | **resolved at plan time** — recorded here, in the PR, and as a comment on #851 |
| R-2 | A value-blind sweep of `#a3372a` hits the out-of-family sites (the over-claim the issue itself flags) | med | high | Match **by role**, never by bare value — the `LITERAL_ROLES` pattern #850 established (`text-\[#a3372a\]`, not `#a3372a`); AC-5 asserts the five surviving files positively | agent | **closed** — AC-5 passes; the five files still paint `#a3372a` |
| R-3 | A token declared without its `@theme inline` row generates **no utility**: the class stays in the markup, the paint silently reverts to unstyled, and every jsdom spec still passes | med | high | AC-7 walks `document.styleSheets` in a real browser for each utility selector — #850's first e2e test, kept for the same reason | agent | **closed** — and demonstrated: phase 3's mutation 2 deleted exactly that row and the e2e went red |
| R-4 | A later slice adds a `dark` override "for consistency", silently flipping these buttons light-on-light | med | high | AC-1's single-declaration + base-block guards fail on the added declaration; AC-3 keeps the measured counter-evidence in the tree; the reason is written at the declaration itself | agent | **closed** — AC-1 and AC-3 pass |
| R-5 | The e2e passes vacuously (selector never matches, or asserts a value that was already the default) | med | med | Mutation-check before commit | agent | **closed** — phase 3 step 3: both mutations turned all 3 tests red, restore returned green |
| R-6 | `check-plan-file-structure.mjs` short-circuits because this plan doc is written but unstaged, passing whatever this section says | high | low | `git add` the plan doc before running the guard; run it as the last step before every push | agent | **closed** — guard run clean before every push; it caught the three missing sibling-spec paths and, later, the skill file |

## Open questions / Assumptions

*(none open)*

### Resolved

- **Open question (from the issue): "decide whether the row-retry button should carry the
  same border as its siblings — which today have none of their own — or keep a deliberate
  one, and record which."** → **Resolved at plan time, by dissolving the premise.** Its
  siblings *do* have one, and it is byte-identical: `booking-view.ts:101` and
  `review-panel.ts:49` both carry `border-[rgba(255,255,255,0.7)]` on their `btnOutline`
  variant. So there is no divergence to adjudicate and no product call to make — all three
  move onto one `--riv-solid-btn-border`, which is what the issue's own "same tokens" AC
  asks for. Escalating this to the maintainer would have been asking them to choose between
  two readings of a fact. Recorded here, in the PR body, and as a comment on #851. See R-1.
- **Assumption: the family is theme-invariant, like its `--riv-solid-btn-ink` sibling.**
  → **Confirmed by measurement, not inherited**: the themed alternatives resolve 1.69:1
  (`--riv-danger-ink`) and 1.52:1 (`--riv-accent-ink`) over the fixed fill. AC-3 pins both.

## Availability & concurrency (invariant #2)

N/A — a CSS token rename. No booking, availability, beach-map, or `(set, date)` write path
is reachable from this diff.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No file under `platform/` is touched.

### Module ownership (§4a)

N/A — no backend behavior added or moved.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no money moves. `booking-pay.ts:210` is one of the sites this slice must **not**
touch (Non-goals), which is the only way payment code appears in this slice at all.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `booking/booking-view.ts` (`BTN_OUTLINE`, `CLS.btnOutline`, `CLS.btnOutlineDanger`) | existing | standalone component | none — class-string constants only | — |
| FE-2 | `booking/review-panel.ts` (`BTN_OUTLINE`, `CLS.btnOutline`, `CLS.btnOutlineDanger`) | existing | standalone component | none | — |
| FE-3 | `booking/my-bookings.ts` (`CLS.rowRetry`) | existing | standalone component | none | — |
| FE-4 | `src/tailwind.css` (5 token declarations + 5 `@theme inline` rows) | existing | stylesheet | — | — |
| FE-5 | `src/testing/glass-tokens.ts` (3 new mirrors) | existing | test fixture | — | — |

**Standards:** no component logic changes — the diff is class strings and CSS custom
properties, so signals/`inject()`/control-flow posture is untouched. Components stay
**theme-agnostic**: none names a theme (`riviera-tailwind` rule 1).

## FE↔BE contract

N/A — no API shape changes.

## Execution status

**Stage pointer:** `merge close-out — DONE pending the CI + Sonar gates on the final head`

**Next action:** Confirm CI green and the Sonar reported-issue list empty on the final head,
then merge. Everything else is done — **merged via PR #859**.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the family spec, red | ✅ | `8023378` |
| 1 — declare the tokens + `@theme` rows, green | ✅ | `7b453f2` |
| 2 — repaint the three components onto them | ✅ | `6b8fb29` |
| 3 — the mocked e2e (+ mutation check) | ✅ | `6703ad6` |
| 4 — ledger row + close-out | ✅ | `3e94a1d` |
| 5 — review + staleness findings (F-1..F-6) | ✅ | `97bee23` |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review gate (history reviewer) **and** `riviera-docs-freshness` pre-merge smoke, found independently | `.claude/skills/riviera-tailwind/SKILL.md:176` still described `--riv-solid-btn-ink` as sitting on "the fixed `#f4f6f7` outline-button fill" — a present-tense fact this slice falsifies, the fill now being a token. Both #835 and #850 extended that same paragraph in their own commit; this slice had not | **fixed** — reworded. First fix appended a four-line slice narrative; trimmed on maintainer feedback to the one durable rule, the ratios staying at the token declaration where a reader needs them |
| F-2 | `riviera-docs-freshness` counting sweep | `docs/design/colour-literal-token-audit.md:22` said "the two slices already cut" — five are now cut, and the sentence's argument never needed the count | **fixed** — count dropped |
| F-3 | `riviera-docs-freshness` rename grep | The audit ledger's prior-slices index listed #829/#835/#855/#850 but not #851 | **fixed** — index extended |
| F-4 | review gate (prior-PR reviewer) | The two new border tokens were waved off as "non-text chrome, so no contrast assertion" — a **category-level exemption without a measurement**, which is exactly what PR #838's own review found to be a real WCAG 1.4.11 regression, and which #840 raised again | **fixed** — measured instead of assumed: 1.06:1 (neutral) and 1.90:1 (danger) over the fill, recorded at both declarations. Neither clears 3:1, but the fill itself is 1.02:1 against the card glass, so the boundary is the glass aesthetic's open question, already tracked at **#834** — not this slice's to change. Values carried across unchanged, per the parity ledger |
| F-5 | review gate (prior-PR reviewer, RV-PROC-1) | *Skills consulted* omitted `angular-developer` entirely — not even as N/A. The same gap #856's review flagged, and which #857 corrected by naming it N/A with its reason | **fixed** — named, N/A with the reason |
| F-6 | review gate (comment reviewer) | The plan said "the **six** out-of-family `#a3372a` sites" in seven places — inherited from the issue body, and contradicted by this plan's own generalization-audit log, which correctly counted **seven positions across five files** | **fixed** — all seven occurrences corrected; the spec's `OUT_OF_FAMILY` array was already right (it asserts presence per file, never a count), so no test changed |

---

## File structure

- `docs/plans/solid-outline-button-token-family.md` — this plan
- `frontend/src/tailwind.css` — the 5 token declarations (base block, with the reason) + their 5 `@theme inline` rows
- `frontend/src/testing/glass-tokens.ts` — `SOLID_BTN_BORDER`, `SOLID_BTN_DANGER_BORDER`, `SOLID_BTN_DANGER_INK` mirrors
- `frontend/src/app/booking/solid-btn-tokens.contrast.spec.ts` — the family guard (AA, the themed-ink bounds, single-declaration, the two-sided sweep)
- `frontend/src/app/booking/booking-view.ts` — `BTN_OUTLINE` + the two outline variants onto tokens
- `frontend/src/app/booking/review-panel.ts` — same
- `frontend/src/app/booking/my-bookings.ts` — `rowRetry` onto the same tokens
- `frontend/src/app/booking/booking-view.contrast.spec.ts|my-bookings.contrast.spec.ts|review-panel.contrast.spec.ts` — the three sibling specs stop hand-copying `'#a3372a'` and take `SOLID_BTN_DANGER_INK` from the mirror; titles/docblocks stop naming the fill by literal
- `frontend/e2e/solid-btn-token-skin.e2e.ts` — the computed-style proof under a forced dark theme
- `docs/design/colour-literal-token-audit.md` — F-2 row → done; the prior-slices index gains #851, and "the two slices already cut" loses a count the staleness sweep falsified
- `.claude/skills/riviera-tailwind/SKILL.md` — two lines: the tier-1 worked example stops calling the fill a literal, and gains one sentence of *rule* (the unit is the whole skin, not one position). Deliberately **not** a per-slice narrative or a second copy of the ratios — a skill carries what the next author must do; the measurements live at the token declaration

---

## Phase 0 — The family spec, red

**Files:** Create `frontend/src/app/booking/solid-btn-tokens.contrast.spec.ts` · Modify `frontend/src/testing/glass-tokens.ts`

- [x] **Step 1:** Add the three mirrors to `glass-tokens.ts`, extending the existing
      `--riv-solid-btn-ink` comment block rather than opening a new one.
- [x] **Step 2:** Write the spec, modelled on `form-error-tokens.contrast.spec.ts`: the AA
      pairs (AC-2), the themed-ink bounds (AC-3), single-declaration + base-block (AC-1),
      and the **two-sided** sweep — no in-family literal left (AC-4) **and** the five
      out-of-family files still present (AC-5).
- [x] **Step 3: Run it, verify it fails** — `npm test -- solid-btn-tokens` → FAIL: the
      tokens are not declared yet (`declarationsOf(...)` returns `[]`).
- [x] **Step 4: Commit** — `git commit -m "Pin the solid outline-button family's contrast and invariance (#851)"`

## Phase 1 — Declare the tokens, green

**Files:** Modify `frontend/src/tailwind.css`

- [x] **Step 1:** Declare the five tokens in the base block, immediately after
      `--riv-solid-btn-ink`, **with the reason at the declaration** — naming the measured
      1.69:1 / 1.52:1 drift, and citing this plan + #851.
- [x] **Step 2:** Add the five `@color-riv-solid-btn-*` rows to `@theme inline`.
- [x] **Step 3: Run it, verify it passes** — `npm test -- solid-btn-tokens` → the four
      token tests PASS; the two sweep tests still FAIL (components not repainted yet).
- [x] **Step 4: Commit.**

## Phase 2 — Repaint the three components

**Files:** Modify `booking-view.ts`, `review-panel.ts`, `my-bookings.ts`

- [x] **Step 1:** Swap each literal for its utility. No other edit in these files.
- [x] **Step 2: Run** — `npm test -- solid-btn-tokens booking-view review-panel my-bookings`
      → all PASS, sweep included.
- [x] **Step 3: Generalization-audit pass.**

Population `every colour position of the outline-button skin, enumerated by grepping each
literal's ROLE across src/` → enumerate
`grep -rn "f4f6f7\|e7ebec\|rgba(200,90,60\|rgba(255,255,255,0.7)\|a3372a" --include=*.ts --include=*.html src/`
→ decision: repaint the 13 in-family positions; leave the 6 `#a3372a` (#852 / unrelated
roles), the 13 unrelated `rgba(255,255,255,0.7)`, and `btnDanger`'s `0.4` alpha. Append to
the log below.

- [x] **Step 4:** `npm run lint && npm run format:check` → clean.
- [x] **Step 5: Commit.**

## Phase 3 — The mocked e2e

**Files:** Create `frontend/e2e/solid-btn-token-skin.e2e.ts`

- [x] **Step 1:** Model on `form-error-token-skin.e2e.ts`: the registry/utility-generation
      test (AC-7), the computed-skin test incl. `hover` (AC-6), and the forced-`dark`
      repeat.
- [x] **Step 2: Run** — `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- solid-btn` → PASS.
- [x] **Step 3: Mutation-check (R-5).** Two mutations, both observed:
      (1) `--riv-solid-btn-fill` → `#ff0000` → **3 failed**; (2) the `--color-riv-solid-btn-border`
      `@theme inline` row deleted → **3 failed**, with `border-riv-solid-btn-border` still present
      in the failing element's class list — the silent no-paint of R-3, caught. Restored → 3 passed.
- [x] **Step 4: Commit.**

## Phase 4 — Ledger row + close-out

**Files:** Modify `docs/design/colour-literal-token-audit.md`, this plan

- [x] **Step 1:** F-2 row → `done — #851, PR #NN`.
- [x] **Step 2:** Finalize Execution status (stage DONE, phases ✅, **merged via PR #859**).
- [x] **Step 3:** `git add` everything, then
      `node scripts/check-plan-file-structure.mjs --diff origin/main` → clean.
- [x] **Step 4: Commit.**

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-31 | phase 2 (new pattern: a theme-invariant token family) | Every colour position of the outline-button skin, enumerated by grepping each literal's **role** tree-wide rather than listing the sites the issue named — which is what surfaced the two `border-[rgba(255,255,255,0.7)]` sites in unrelated roles the issue's site list did not contain | `grep -rn "f4f6f7\|e7ebec\|rgba(200,90,60\|border-\[rgba(255,255,255,0\.7)\]\|a3372a" --include=*.ts --include=*.html src/ \| grep -v "\.spec\.ts"` | 13 in-family positions across 3 components; 7 out-of-family `#a3372a` across 5 files; 2 out-of-family borders (`auth/auth-page.ts:120`, `venue/availability-calendar.html:8`); 1 near-miss alpha (`booking-view.ts:100`, `rgba(200,90,60,0.4)`) | Repainted the 13. Left the other 10 — each a different role, and `payouts-tab.html`'s `/opacity` form is #852's. The two out-of-family borders are why the guard's sweep is file-scoped, not tree-wide |

---

## Acceptance-criteria verification (final)

- [x] **AC-1..AC-5:** `npx ng test --watch=false --include="src/app/booking/solid-btn-tokens.contrast.spec.ts"` → **7 passing**. Verified at `6b8fb29`.
- [x] **AC-6, AC-7:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config=playwright.a11y.config.ts solid-btn` → **3 passing**, mutation-checked twice. Verified at `6703ad6`.
- [x] **AC-8:** ledger F-2 row reads `done — #851, PR #859`, with n corrected 9 → 13.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [x] **Availability** section justified N/A (invariant #2).
- [x] Pool + cutoff rules honored (invariants #3, #4) — N/A.
- [x] **Modulith** section justified N/A (invariant #11).
- [x] **Payment/payout** section justified N/A (invariants #5, #8, #9).
- [x] Refund policy (invariant #10) — N/A.
- [x] Timezone (invariant #6) — N/A.
- [x] Booking codes (invariant #7) — N/A.
- [x] Flyway (invariant #12) — N/A, no schema change.
- [x] **Frontend** standards met; components stay theme-agnostic; no `as any`.
- [x] Execution status at HEAD matches reality.
- [x] Risk register has no stale `open` rows; Open Questions empty.
- [x] **Close-out written in THIS PR**, citing `merged via PR #859`.
- [x] **The review gate ran in full** — `code-review` plugin rung 1 (5-reviewer fan-out, medium effort) + `riviera-review-overlay`, plus a `riviera-docs-freshness` pre-merge smoke. 6 findings, all fixed in `97bee23`; recorded on the PR.
