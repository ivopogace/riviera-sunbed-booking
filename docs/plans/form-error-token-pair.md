# Form-error skin — a theme-invariant token pair Implementation Plan

> **For agentic workers:** to implement this plan use `tdd` at the plan's named seams
> (`/implement` is the human's entry command — `riviera-sdlc`'s Implement row is the
> model's route). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the six hard-coded form-error positions (`bg-[#f6e8e7]` + `text-[#a3160e]` on
three tourist-facing error banners) with one **theme-invariant token pair**, declared once in
`tailwind.css`'s base block with no dark override and the reason at the declaration, proven by a
family contrast spec and a mocked e2e that pins the computed skin under a forced `dark` theme.

**Architecture:** The single significant decision is **not to reuse `--riv-error-ink`**. That token
is themed (`#a3160e` light, `#ffa9a1` dark) and would resolve `#ffa9a1` over a fill that stays
`#f6e8e7` — **1.54:1, light on light**, against the 6.58:1 the fixed pair delivers. The fill and the
ink are pinned to each other, so they move together onto a new pair (`--riv-form-error-fill` /
`--riv-form-error-ink`) declared once, in the base block, exactly as `--riv-solid-btn-ink` was at
#835. A theme-invariant token is a decision to record, so the composite-maths reasoning currently
stranded in `booking-dialog.ts:309`'s template comment moves into the token declaration.

**Persistence:** N/A — frontend-only, no backend or schema change (invariant #1 untouched).

**Source of intent:** GitHub issue #850 (class **F**, row F-1 of
`docs/design/colour-literal-token-audit.md`); parent epic #836.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that AC-5 as
written is unsatisfiable, since the value must live in `tailwind.css`; see Open questions §Resolved)
· `riviera-plan-doc` (this template — forced the Behavior-parity ledger, which is what surfaced the
`ERROR_RED`-conflation risk R-3) · `tdd` (each phase red-first at the seams named below) ·
`riviera-review-overlay` (review gate — runs at ready-for-review) · `riviera-docs-freshness`
(close-out — due, the slice changes what the audit ledger and the token-count facts state) ·
`riviera-tailwind` (the theme-invariant-token rule and its two in-tree precedents `--riv-solid-btn-ink`
/ `--riv-accent-*`; also the `@theme inline` requirement without which the utility never generates,
and the "prove no drift by computed style, never the class list" rule that shapes AC-3) ·
`riviera-frontend` (token registry lives in `tailwind.css` + `core/theme.ts` only; the new spec
colocates in `booking/` beside its consumers; the e2e belongs in the CI-safe mocked suite
`frontend/e2e/`) · `playwright-cli` (mocked-e2e authoring — pending, loads at phase 2) ·
`riviera-local-debug` (cloud-session `npm` recipe + scoped-test discipline — loads before the first
test run) · `angular-developer` (`N/A — no component logic changes; the diff is class strings only`)

**Branch:** `claude/sdlc-850-fc9lf9` — the cloud session's **designated remote branch, standing in
for `feature/form-error-token-pair`** per `riviera-sdlc` §Remote/cloud session addendum. The literal
`feature/*` branch is deliberately not created.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the three tourist error banners, when any of them renders, then its fill and
      ink both come from `--riv-form-error-fill` / `--riv-form-error-ink` and no `#f6e8e7` or
      `#a3160e` literal remains in the component source. *Seam:* the rendered component template
      (class strings in `booking-dialog.ts` / `booking-pay.ts` / `my-bookings.ts`) · *Pinned by:*
      `form-error-tokens.contrast.spec.ts` › `no component still paints the pair as a literal`
- [ ] **AC-2:** Given `tailwind.css`, when the declarations are read, then both tokens are declared
      exactly once, in the base block, and appear in **no** `[data-riv-theme='riviera']` or
      `[data-riv-theme='dark']` block — so the pair resolves the same value under all three themes —
      and those values equal the `src/testing/glass-tokens.ts` mirror. *Seam:* the `tailwind.css`
      stylesheet source (read from the spec, the `core/theme-boot.spec.ts` drift-guard pattern) ·
      *Pinned by:* `form-error-tokens.contrast.spec.ts` › `the pair is declared once, with no dark
      override` + `the test mirror matches the stylesheet`
- [ ] **AC-3:** Given the ink over the fill, when the ratio is computed, then it is ≥ 4.5:1 (WCAG AA
      normal text) — and the themed `--riv-error-ink` over the same fill is shown to fail, bounding
      why the pair exists. *Seam:* the `src/testing/glass-tokens.ts` mirror · *Pinned by:*
      `form-error-tokens.contrast.spec.ts` › `the pair clears AA` + `the themed error ink would not`
- [ ] **AC-4:** Given the booking dialog driven to a `SET_TAKEN` error, when the banner renders,
      then its computed `background-color` is `rgb(246, 232, 231)` and `color` is `rgb(163, 22, 14)`;
      and given the same flow under a forced `dark` **document** theme, then both computed values are
      **unchanged**. *Seam:* the rendered page in the mocked Playwright suite
      (`[data-testid="dialog-error"]`) · *Pinned by:* `form-error-token-skin.e2e.ts` › `the banner
      paints the registered pair` + `the pair does not move under a dark document theme`
- [ ] **AC-5:** Given each token, when the page loads, then Tailwind has generated its utility
      (`bg-riv-form-error-fill`, `text-riv-form-error-ink`) — the `@theme inline` row without which
      the class stays in the markup and the paint silently does not change. *Seam:* the document's
      emitted CSS rules in the mocked Playwright suite · *Pinned by:* `form-error-token-skin.e2e.ts`
      › `every registered token is declared and generates its utility`
- [ ] **AC-6:** Given the three contrast specs that currently restate `'#f6e8e7'` / `'#a3160e'`, when
      they run, then they read those values from `src/testing/glass-tokens.ts` and no local copy
      remains — while `booking-dialog.contrast.spec.ts` keeps the **themed** `--riv-error-ink` (its
      `.field-error`) on the separate `ERROR_INK` / `DARK_ERROR_INK` constants. *Seam:* the
      `src/testing/glass-tokens.ts` module boundary · *Pinned by:* the three specs' own suites
      (`booking-dialog.contrast.spec.ts`, `booking-pay.contrast.spec.ts`,
      `my-bookings.contrast.spec.ts`) passing with no local `ERROR_FILL` constant
- [ ] **AC-7:** Given `docs/design/colour-literal-token-audit.md`, when the class-F table is read,
      then the F-1 row reads `**done — #850, PR #NN**`, updated **in this PR**. *Seam:* the committed
      ledger file · *Pinned by:* the merge close-out review (docs, not a test)

## Non-goals

- The **other** class-F family (`--riv-solid-btn-*` fill/hover/border + `#a3372a` danger ink) —
  that is #851, and it is a different set of six-plus positions.
- The class-T `#a3160e` operator sites (32 positions) — done at #855/PR #856 on the **themed**
  `--riv-error-ink`, correctly, because those hosts are porcelain-pinned. This slice must not
  touch or re-point them.
- The `/opacity` `#a3160e/25|30|40|50|10` tint half (#852) — tokenising those changes the computed
  value and is not a substitution.
- The vestigial `class="form-error"` marker on `booking-dialog.ts:311`. It matches no CSS rule
  anywhere (grep: no `.form-error` in any stylesheet) and no spec selector, but `riviera-tailwind`
  rule 2 keeps old semantic class names as inert markers, and several spec comments still use
  ".form-error" as the family's name. Removing it is a separate judgement, not this slice's.
- Re-tuning either value. The pair ships byte-identical to what renders today.

## Behavior-parity ledger

> This slice replaces the styling of an existing surface, so the "no visual change" claim is
> verified position-by-position rather than asserted.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `booking-dialog` banner paints `#f6e8e7` fill / `#a3160e` ink, all three themes | preserved | `bg-riv-form-error-fill text-riv-form-error-ink`; computed values pinned byte-identical by `form-error-token-skin.e2e.ts` (AC-4), incl. under forced `dark` |
| `booking-pay` banner, same pair | preserved | same utilities; AA maths pinned by `booking-pay.contrast.spec.ts` reading the shared mirror |
| `my-bookings` rows-failed alert, same pair | preserved | same utilities; AA maths pinned by `my-bookings.contrast.spec.ts` reading the shared mirror |
| Every other class on the three banners (radius, padding, `text-[13px]`/`[13.5px]`, `font-semibold`, margins) | preserved | untouched — only the two colour utilities change per site |
| `role="alert"` + `data-testid` on all three | preserved | untouched; the existing unit/a11y specs (`booking-dialog.spec.ts:407`, `my-bookings.spec.ts:287`, `booking-pay.a11y.spec.ts:107`) keep passing unchanged |
| `booking-dialog.ts:309`'s template comment carrying the composite-maths rationale | changed | folded into the token declaration in `tailwind.css` (issue #850's explicit instruction) so the reasoning sits where the decision is, not at one of three call sites |
| `booking-dialog.contrast.spec.ts`'s `ERROR_RED` doing double duty for the themed `.field-error` ink **and** the banner ink | changed | split: the themed field-error keeps `ERROR_INK`/`DARK_ERROR_INK` from the mirror; the banner moves to `FORM_ERROR_INK`. Same values today, different tokens — see R-3 |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The `@theme inline` rows are omitted or misspelled: the utility never generates, the class stays in the markup, and the banner silently loses its skin — invisible to any class-list check | med | high | AC-5's e2e walks the document's emitted `CSSStyleRule` selectors and asserts both utilities exist (the `accent-token-inks.e2e.ts` pattern, which exists because this exact failure is otherwise undetectable) | claude | open |
| R-2 | A later slice adds a `dark:` override for the pair "for consistency", flipping the ink to `#ffa9a1` over the fixed fill — 1.54:1, the exact drift this slice exists to prevent | med | high | AC-2's stylesheet drift guard fails the build if either name appears in a themed block; plus the reason written at the declaration | claude | open |
| R-3 | Rewiring `booking-dialog.contrast.spec.ts` conflates the two reds: its `ERROR_RED` currently serves both the **themed** `.field-error` ink and the **invariant** banner ink. Pointing the field-error at the new invariant token would silently stop testing the dark theme's `#ffa9a1` | med | med | Explicit split in phase 1: `LIGHT_SURFACES.error` → `ERROR_INK`, dark theme keeps `DARK_ERROR_INK`, banner test → `FORM_ERROR_*`. Called out in the parity ledger so review can check rather than re-derive | claude | open |
| R-4 | Visual drift the contrast maths cannot see (a wrong-but-still-AA colour, a dropped utility) | low | med | `riviera-tailwind`'s hard rule: AC-4 diffs **computed styles** via `toHaveCSS`, not the class list | claude | open |
| R-5 | The three banners' literals are re-introduced by a later slice because nothing forbids them | low | low | AC-1's grep-style assertion in the family spec fails on any component-source occurrence | claude | open |
| R-6 | In-flight collision with a sibling class-F/class-T slice touching `tailwind.css` or `glass-tokens.ts` | low | low | Checked at intake: **zero open PRs** on the repo, and #855/PR #856 (the only recently-merged sibling) is on `main` and is a Non-goal here. No Flyway number to claim — frontend-only slice | claude | **closed** — verified at plan time |

## Open questions / Assumptions

*(empty — both intake findings resolved below)*

### Resolved

- **Open question (from the issue-intake grill):** issue #850's AC "No `#f6e8e7` literal remains
  outside `*.spec.ts`" is **unsatisfiable as literally written** — tokenising *moves* the value into
  `frontend/src/tailwind.css` (not a spec), and the issue's own next-to-last AC requires the test
  mirror `src/testing/glass-tokens.ts` (also not a spec) to hold it too. **Outcome:** read as intent,
  not letter, and restated as AC-1 + AC-2: the literal survives in exactly **two** declared homes —
  the `tailwind.css` declaration and the test-side mirror — plus the e2e's `rgb()` expectations, and
  in **no component source**. This is precisely the shape #835 shipped. No issue edit needed; the
  restatement lives here and in the PR body.
- **Open question:** is the pair's AA claim (`~6.6:1`, from the `booking-dialog.ts:309` comment)
  still accurate? **Outcome:** verified at plan time — `#a3160e` on `#f6e8e7` is **6.58:1**; the
  themed dark ink `#ffa9a1` on the same fill is **1.54:1**. Both numbers go into the token comment
  and AC-3, so the "why not the themed token" argument is a measured fact in the tree, not a claim.
- **Assumption → verified:** all six positions are still exactly where the issue says
  (`booking-dialog.ts:311`, `booking-pay.ts:255`, `my-bookings.ts:290`), and `#f6e8e7` occurs
  nowhere else in `frontend/src` or `frontend/e2e` outside those three sites, the `:309` comment and
  the three contrast specs. Confirmed by grep at plan time.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` The slice changes two CSS colour positions per banner on
three presentational components; it touches no booking, map, or `availability` code path, and no
network call.

## Spring Modulith — modules, interfaces, events

`N/A — frontend-only.` No backend file is in scope.

### Module ownership (§4a)

`N/A — frontend-only; no backend capability added or moved.`

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` `booking-pay.ts` is touched, but only the class string on its error
banner; no Stripe, money, or ledger code changes.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `booking/booking-dialog.ts:308-317` | existing | standalone component (inline template) | unchanged — `errorMessage()` signal read | unchanged |
| FE-2 | `booking/booking-pay.ts:253-261` | existing | standalone component (inline template) | unchanged | unchanged |
| FE-3 | `booking/my-bookings.ts:287-296` | existing | standalone component (inline template) | unchanged | unchanged |
| FE-4 | `src/tailwind.css` | existing | token registry (`@theme inline` + base block) | — | — |
| FE-5 | `src/testing/glass-tokens.ts` | existing | the one test-side token mirror | — | — |
| FE-6 | `booking/form-error-tokens.contrast.spec.ts` | **new** | vitest family spec (AA + theme-invariance drift guard) | — | — |
| FE-7 | `e2e/form-error-token-skin.e2e.ts` | **new** | mocked Playwright spec (CI-safe suite) | — | — |

**Standards:** no component logic changes — the diff is class strings, one template comment, token
declarations and tests. Token consumption uses the **named utilities** (`bg-riv-*`/`text-riv-*`),
never `var(--riv-*)` at the call site, per `riviera-tailwind` §Styling across the themes tier 1;
components stay theme-agnostic and name no theme.

## FE↔BE contract

`N/A — no contract change.`

## Execution status

**Stage pointer:** `plan — written, awaiting phase 0`

**Next action:** Run phase 0 — write `form-error-tokens.contrast.spec.ts` red, then declare the pair
in `tailwind.css` (base block, `@theme inline` rows, reason + both ratios at the declaration) and
mirror it in `glass-tokens.ts`.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Declare the theme-invariant pair + its family spec | | |
| 1 — Migrate the three banners and rewire the three contrast specs | | |
| 2 — Mocked e2e: registry, utility generation, computed skin under a forced dark theme | | |
| 3 — Ledger row + close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix re-enters
at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| *(none yet)* | | | |

---

## File structure

- `docs/plans/form-error-token-pair.md` — this plan doc
- `docs/design/colour-literal-token-audit.md` — the F-1 row moves to `done` (AC-7)
- `frontend/src/tailwind.css` — the two `@theme inline` rows + the base-block declaration with its reason
- `frontend/src/testing/glass-tokens.ts` — `FORM_ERROR_FILL` / `FORM_ERROR_INK`, the one test-side mirror
- `frontend/src/app/booking/booking-dialog.ts` — banner class string + the retired template comment
- `frontend/src/app/booking/booking-pay.ts` — banner class string
- `frontend/src/app/booking/my-bookings.ts` — banner class string
- `frontend/src/app/booking/form-error-tokens.contrast.spec.ts` — **new**, the family spec (AC-1/2/3)
- `frontend/src/app/booking/booking-dialog.contrast.spec.ts` — reads the mirror; splits the two reds (R-3)
- `frontend/src/app/booking/booking-pay.contrast.spec.ts` — reads the mirror
- `frontend/src/app/booking/my-bookings.contrast.spec.ts` — reads the mirror
- `frontend/e2e/form-error-token-skin.e2e.ts` — **new**, the mocked computed-style proof (AC-4/5)

---

## Phase 0 — Declare the theme-invariant pair + its family spec

**Files:** Create `frontend/src/app/booking/form-error-tokens.contrast.spec.ts` · Modify
`frontend/src/tailwind.css`, `frontend/src/testing/glass-tokens.ts`

- [ ] **Step 1: Write the failing spec** — `form-error-tokens.contrast.spec.ts`, four tests:
      `the pair clears AA` (≥ 4.5:1), `the themed error ink would not` (`DARK_ERROR_INK` over the
      fill is < 4.5:1 — the bounding test), `the pair is declared once, with no dark override`
      (read `src/tailwind.css`, assert one occurrence of each name and none inside a
      `[data-riv-theme='riviera'|'dark']` block — the `core/theme-boot.spec.ts` read-the-source
      pattern), and `the test mirror matches the stylesheet`. Plus AC-1's
      `no component still paints the pair as a literal` (read the three component sources).
- [ ] **Step 2: Run it, verify it fails** — `npm test -- form-error-tokens` → FAIL (no
      `FORM_ERROR_FILL` export; no declaration in `tailwind.css`).
- [ ] **Step 3: Minimal implementation** — add to `tailwind.css`'s base block, beside
      `--riv-solid-btn-ink` (its precedent neighbour), with a `/** … */` **doc** comment (the
      `check-inline-comments.mjs` guard bans multi-line non-doc comments on added lines):
      the composite-maths reasoning inherited from `booking-dialog.ts:309`, the measured 6.58:1,
      the 1.54:1 the themed token would give, and the explicit "declared once, no dark override,
      deliberately". Add the two `@theme inline` rows next to `--color-riv-error-ink`. Mirror as
      `FORM_ERROR_FILL` / `FORM_ERROR_INK` in `glass-tokens.ts`.
- [ ] **Step 4: Run it, verify it passes** — `npm test -- form-error-tokens` → PASS. (AC-1's test
      still fails here — the components migrate in phase 1; keep it red-with-a-reason or land it in
      phase 1, whichever `tdd` calls cleaner at the keyboard. Decide once, note it in the commit.)
- [ ] **Step 5: Generalization-audit pass** — population: *every colour position in
      `frontend/src` that pairs a FIXED fill with an ink*, enumerated from the audit ledger's
      class-F table rather than by resemblance. Record the command and the verdict per row.
- [ ] **Step 6: Commit** — `git commit -m "Declare the form-error skin as a theme-invariant token pair (#850)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Migrate the three banners and rewire the three contrast specs

**Files:** Modify `booking-dialog.ts`, `booking-pay.ts`, `my-bookings.ts`,
`booking-dialog.contrast.spec.ts`, `booking-pay.contrast.spec.ts`, `my-bookings.contrast.spec.ts`

- [ ] **Step 1** — Swap `bg-[#f6e8e7]` → `bg-riv-form-error-fill` and `text-[#a3160e]` →
      `text-riv-form-error-ink` at all three sites; delete `booking-dialog.ts:309`'s now-relocated
      comment. Every other class on those lines is untouched (parity ledger).
- [ ] **Step 2** — Rewire the three contrast specs onto the mirror; delete each local `ERROR_FILL`
      (and `ERROR_RED` where it only served the banner). **R-3:** in `booking-dialog.contrast.spec.ts`,
      `LIGHT_SURFACES.error` must become `ERROR_INK` (themed `.field-error`), *not* `FORM_ERROR_INK`.
- [ ] **Step 3: Run** — `npm test -- booking-dialog booking-pay my-bookings form-error-tokens` → PASS,
      AC-1's literal test now green too.
- [ ] **Step 4: Commit** — `git commit -m "Paint the three tourist error banners from the token pair (#850)"`
- [ ] **Step 5: Update plan-doc execution status.**

---

## Phase 2 — Mocked e2e: registry, utility generation, computed skin under a forced dark theme

**Files:** Create `frontend/e2e/form-error-token-skin.e2e.ts`

- [ ] **Step 1** — Load `playwright-cli` (Skill-routing gate: new e2e authoring). Model the spec on
      `e2e/accent-token-inks.e2e.ts` — the same slice shape, one class earlier in the audit.
- [ ] **Step 2** — Drive the booking dialog to its `SET_TAKEN` error via the mock already used by
      `e2e/booking-flow.e2e.ts:218` (409 + `code: 'SET_TAKEN'`), then assert `toHaveCSS` on
      `[data-testid="dialog-error"]`: `background-color` = `rgb(246, 232, 231)`, `color` =
      `rgb(163, 22, 14)`.
- [ ] **Step 3** — Repeat with `page.addInitScript(() => localStorage.setItem('riviera-theme', 'dark'))`,
      assert `html[data-riv-theme="dark"]`, and assert **the same two values** — the drift proof
      (AC-4). Plus the registry + emitted-selector walk for AC-5.
- [ ] **Step 4: Run** — `npm run test:e2e:a11y -- form-error-token-skin` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "Pin the form-error skin's computed values across themes (#850)"`
- [ ] **Step 6: Update plan-doc execution status.**

---

## Phase 3 — Ledger row + close-out

**Files:** Modify `docs/design/colour-literal-token-audit.md`, this plan doc

- [ ] **Step 1** — Class-F table, F-1 row: `open → #850` becomes `**done — #850, PR #NN**`, matching
      the class-T row's shipped form.
- [ ] **Step 2** — Run `node scripts/check-plan-file-structure.mjs --diff origin/main` (the plan doc
      staged), the frontend lint/format checks, and the scoped test suites.
- [ ] **Step 3** — `riviera-docs-freshness` over the slice's range; fold any finding in here.
- [ ] **Step 4** — Finalize this Execution status **before** the merge, in the PR's own last commit,
      citing `merged via PR #NN`.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `npm test -- form-error-tokens` → the literal test passes. Verified at `<sha>`.
- [ ] **AC-2:** `npm test -- form-error-tokens` → the drift-guard tests pass. Verified at `<sha>`.
- [ ] **AC-3:** `npm test -- form-error-tokens` → AA + the bounding test pass. Verified at `<sha>`.
- [ ] **AC-4:** `npm run test:e2e:a11y -- form-error-token-skin` → both theme runs pass. Verified at `<sha>`.
- [ ] **AC-5:** same run → the utility-generation test passes. Verified at `<sha>`.
- [ ] **AC-6:** `npm test -- booking-dialog booking-pay my-bookings` → pass, no local literal left. Verified at `<sha>`.
- [ ] **AC-7:** `git show` the ledger diff → F-1 reads `done`. Verified at `<sha>`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [ ] **Availability** section justified N/A (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — N/A.
- [ ] **Modulith** section justified N/A (invariant #11).
- [ ] **Payment/payout** section justified N/A (invariants #5, #8, #9).
- [ ] Refund policy (invariant #10) — N/A.
- [ ] Timezone (invariant #6) — N/A.
- [ ] Booking codes (invariant #7) — N/A.
- [ ] Flyway migration (invariant #12) — N/A, no schema change.
- [ ] **Frontend** standards met: named utilities not raw `var()`, components theme-agnostic, no `as any`.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty.
- [ ] **Close-out written in THIS PR** — the plan doc's final state cites `merged via PR #NN`.
- [ ] **The review gate ran in full** — the `pr-gates.md` §1 ladder *plus* `riviera-review-overlay`.
