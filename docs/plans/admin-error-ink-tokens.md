# Admin Error/Danger Ink Token Sweep — Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Every hardcoded red literal under `frontend/src/app/admin` and
`shared/confirm-with-reason.ts` is replaced by a registered `--riv-*` token, so the admin
console paints negative/danger state from the token registry and follows a theme, with the
resulting colour movement proven per surface rather than eyeballed.

**Architecture:** Two token families, because the console has two distinct negative
*treatments*, not one. Existing `--riv-error-ink` absorbs the bare error/danger ink
(`#b3261e` → `#a3160e`); a new five-token `--riv-danger-*` set absorbs the erasure confirm
panel's tinted treatment (`#8f2c22` ink over an `rgba(179,54,43,…)` fill/border family),
whose values move to the registry **byte-identical** so the treatment is preserved while
the literals leave the components. The danger tokens are declared as pre-composed `rgba()`
values, matching the repo's existing token idiom (`--riv-field-border`, `--riv-card-glass`)
rather than Tailwind's `/opacity` modifier — see R-4.

**Persistence:** N/A — frontend-only styling slice, no schema, no migration (invariant #1
untouched).

**Source of intent:** GitHub issue #829 (deferred from #826 / PR #827, recorded there as
OQ-2 and as a Non-goal). Both issue comments verified against merged `main` `0dec1f9`;
corrections recorded under *Open questions → Resolved* (OQ-A…OQ-D).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — surfaced the
second red family `#8f2c22`/`rgba(179,54,43,…)` that neither the issue nor its two comments
enumerate, and corrected the issue's "dark themes" claim) · `riviera-plan-doc` (this
template — forced the Behavior-parity ledger, which is what turns "styling only, no
behaviour change" from a claim into a per-site verdict) · `tdd` (phase 0 writes the contrast
spec red against constants that do not exist yet, so the token values are gated by AA maths
before any component moves) · `riviera-review-overlay` (review gate — due at
ready-for-review; RV-FE-7/RV-FE-E2E own the SCSS and e2e-placement calls) ·
`riviera-docs-freshness` (`N/A — deferred to merge close-out step 5 over the slice's own
merge range; no substrate doc states the literals today, verified by
`grep -rln 'b3261e' docs/`) · `riviera-tailwind` (token-first styling: named utility once
the token is registered, the no-visual-drift computed-style rule that shapes AC-5, and the
rejection of the `/opacity` modifier in R-4) · `riviera-frontend` (placement: the new
contrast spec is colocated per-feature, the token registry stays the two-place
`tailwind.css` + `core/theme.ts` pair — and needs no `core/theme.ts` row, since that
registry carries only what the switcher UI shows) · `angular-developer` + angular-cli MCP
(`search_documentation` v22 — confirmed Emulated encapsulation scopes only a component's
own `styles`, so the global `tailwind.css` utilities reach these inline templates unchanged;
no Angular API is touched by this slice)

**Branch:** `claude/sdlc-829-implementation-pofv2c` — **cloud-session substitution** for
`feature/admin-error-ink-tokens` per `riviera-sdlc` §Remote/cloud addendum. The designated
remote branch stands in; do not create the literal `feature/…` branch. The plan was authored
on `claude/sdlc-829-planning-uy2pt1` (never merged to `main`); the implementation session was
designated a second branch, so it is **based on the planning branch**, not on `main`, and
carries both of its commits.

---

## Acceptance criteria (testable)

> ACs for a presentation-only slice are written at the surface the slice actually changes —
> the rendered computed style and the contrast maths — since there is no application
> boundary in scope. `riviera-tailwind`'s hard rule is that the class list is never the
> proof, so no AC asserts a class name.

- [x] **AC-1:** Given the whole of `frontend/src`, when
  `grep -rno '\[#b3261e\]' frontend/src --include=*.ts --include=*.html` runs, then it
  returns exactly the **2** occurrences on `app.html:6` (the deliberate sign-out-notice
  deviation, `app.ts:59–69`) and nothing else. *Pinned by:* the command itself, run in
  AC-verification; the count moves 18 → 2.
- [ ] **AC-2:** Given the whole of `frontend/src`, when
  `grep -rno '#8f2c22\|179, *54, *43\|#0a5f73' frontend/src --include=*.ts --include=*.html`
  runs, then it returns **0** occurrences. *Pinned by:* the command itself.
- [x] **AC-3:** Given the porcelain admin console, when the error ink (`#a3160e`) is
  composited over each of the two admin surfaces — the bare page background
  (`PORCELAIN_STOPS`) and the card glass (`PORCELAIN_CARD_GLASS` over `PORCELAIN_STOPS`) —
  then every pair meets WCAG AA 4.5:1, and is **at least as high as** the same pair computed
  with the outgoing `#b3261e`. *Pinned by:*
  `admin-console.contrast.spec.ts` › `'the error ink meets AA on both admin surfaces'` and
  › `'the migration does not lower contrast on any admin surface'`.
- [x] **AC-4:** Given the erasure confirm panel, when the danger ink (`--riv-danger-ink`) is
  composited over the danger fill over the card glass over each porcelain stop — and again
  over the action fill for the button label — then both pairs meet AA 4.5:1, in **porcelain
  and in dark**. *Pinned by:* `admin-console.contrast.spec.ts` ›
  `'the danger ink meets AA on the panel and action fills, per theme'`.
- [ ] **AC-5:** Given the mocked-backend admin console rendered in a real browser, when the
  error message, the destructive button, the Suspended badge and the erasure panel are
  read with `toHaveCSS`, then each reports exactly the token's resolved value
  (`rgb(163, 22, 14)` for the error ink; `rgb(143, 44, 34)` and
  `rgba(179, 54, 43, 0.06)` for the danger family) — i.e. the computed style, not the class
  list, is what is pinned. *Pinned by:* `admin-token-inks.e2e.ts`.
- [ ] **AC-6:** Given every admin surface the mocked e2e already visits (including
  `admin-commissions.e2e.ts`'s validation-error state), when the suite runs, then
  `expectNoSeriousAxeViolations` still reports zero serious/critical violations — the
  real-render `color-contrast` net does not regress. *Pinned by:* `npm run test:e2e:a11y`
  (existing specs, unchanged).
- [ ] **AC-7:** Given the admin console subtree, when it renders under a document theme of
  `riviera` or `dark`, then every migrated site resolves the token through the subtree's own
  `data-riv-theme="porcelain"` pin (`admin-console.ts:59`) and paints the porcelain value —
  proving the `@theme inline` mapping still defers resolution to the consuming scope.
  *Pinned by:* `admin-token-inks.e2e.ts` › `'the console keeps its porcelain inks under a
  dark document theme'`.

## Non-goals

- **`app.html:6` — the sign-out-notice bar.** Its `border-[#b3261e]` + `text-[#b3261e]` is a
  **documented deliberate deviation** (`app.ts:59–69`: solid white/`#b3261e` in both themes,
  legibility over theme harmony for a shared-device safety notice, measured 6.5:1). A sweep
  that migrates "all 18" reverses a recorded decision on autopilot. Out of scope, and the
  TSDoc therefore needs no edit.
- **Unifying the two destructive buttons' appearance.** `confirm-with-reason.ts`'s outlined
  button and `admin-privacy.ts`'s tinted Erase button end this slice painted from *different*
  token families because they are different treatments today. Making them look alike is a
  visual-design decision, not a token migration — see OQ-1.
- **The `#0a4f5e` teal literals** (`admin-refund-outbox.ts:74`, `admin-privacy.ts:199`,
  `admin-mail-outbox.ts:87`, `admin-mail-delivery.ts:67,73`). Not red, not in #829's
  mechanism; a separate accent-ink sweep. Follow-up issue at close-out.
- **Behaviour, wire format, or any backend invariant.** Nothing is added, removed, or
  reordered in any template beyond the value of a colour utility.
- **New `*.a11y.spec.ts` files.** `admin/` already has one per tab; axe cannot measure
  contrast under jsdom (`admin-privacy.a11y.spec.ts` states this), so the contrast proof
  lands in the contrast spec + e2e, not in axe.

## Behavior-parity ledger

> The slice replaces a colour *value* at 21 utility positions across 10 files. Every row is
> presentation; the ledger exists to make "no behaviour change" a per-mechanism verdict
> rather than a claim.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Error text renders `#b3261e` on 13 error-message sites | **changed (intended)** | renders `#a3160e` via `text-riv-error-ink`; darker, so contrast rises on every admin surface (AC-3 asserts the direction, not just the floor) |
| Destructive button border + label render `#b3261e` (`confirm-with-reason.ts:62`) | **changed (intended)** | `border-riv-error-ink text-riv-error-ink`; same two positions, one token |
| Suspended badge border + label render `#b3261e` (`admin-operators.ts:157`) | **changed (intended)** | `border-riv-error-ink text-riv-error-ink` |
| `Erased` term renders `#b3261e` (`admin-privacy.ts:237`) | **changed (intended)** | `text-riv-error-ink` |
| `Kept` term renders `#0a5f73` (`admin-privacy.ts:239`) | **changed (intended)** | `text-riv-accent-ink` → `#085a6e`; finishes the `<dl>` pair so neither term is a literal |
| Erasure confirm panel renders `rgba(179,54,43,0.35)` border / `rgba(179,54,43,0.06)` fill | **preserved** | `border-riv-danger-border bg-riv-danger-fill`, token values byte-identical to the literals |
| Erase button renders `rgba(179,54,43,0.6)` border / `rgba(179,54,43,0.1)` fill / `#8f2c22` label | **preserved** | `border-riv-danger-action-border bg-riv-danger-action-fill text-riv-danger-ink`, all byte-identical |
| Confirm heading renders `#8f2c22` (`admin-privacy.ts:129`) | **preserved** | `text-riv-danger-ink`, byte-identical |
| `[animation:riv-pop_0.22s_ease] motion-reduce:[animation:none]` on the confirm panel | **preserved** | untouched; the edit replaces colour utilities only, on the same elements |
| `aria-disabled` opacity/cursor states on both destructive buttons | **preserved** | untouched |
| `appTouchTarget` / `appBusy` / `data-testid` on every migrated element | **preserved** | untouched — no element is added, removed, or re-nested, so `check-touch-target` and every existing spec query still resolve |
| Every admin site resolves its ink from the console's own `data-riv-theme="porcelain"` pin | **preserved** | `@theme inline` emits `var(--riv-*)` into the utility, so resolution still happens at the consuming scope (AC-7) |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The sweep silently reverses the `app.html:6` deliberate deviation, because "replace all 18" reads as complete | med | med | it is a Non-goal above; AC-1 asserts the residual count is **exactly 2 on `app.html:6`**, so an over-eager sweep fails the AC rather than passing it | ivopogace | closed — phase 1 left exactly the 2 `app.html:6` occurrences standing |
| R-2 | The new dark `--riv-danger-*` values are latent (no in-tree consumer can render them — the console pins porcelain) and so ship unproven | high | med | AC-4 asserts the dark pairs in the contrast spec, which is pure maths and needs no renderer; the values are candidates until that spec is green, and are adjusted to pass rather than asserted around | ivopogace | closed — the planned candidates passed unchanged (phase 0) |
| R-3 | Encoding the existing button/panel boundaries as tokens exposes a **pre-existing** sub-3:1 non-text contrast (WCAG 1.4.11) on the Erase button's border — hand-computed at ≈2.6:1 over the panel fill | med | med | the contrast spec's scope is **text pairs (1.4.3)**; a non-text boundary is asserted only where it already holds. If the spec finds one below 3:1, **do not silently change the value** — record it as a finding and open a follow-up issue. Changing it is a visual decision outside a token migration | ivopogace | **materialised** — recorded as F-1 in the Findings register; follow-up issue at close-out |
| R-4 | Expressing the danger tints as Tailwind opacity modifiers (`bg-riv-danger/6`) would compile to `color-mix(in oklab, …, transparent)`, changing both the interpolation space and the `getComputedStyle` string — indistinguishable from a real regression under the no-drift rule | low | high | **rejected at plan time**: the five danger tokens are declared as pre-composed `rgba()` values, matching the repo's existing idiom (`--riv-field-border: rgba(12, 42, 51, 0.55)`). Verified against Tailwind v4 docs + tailwindlabs PR #15201 | ivopogace | closed — decided |
| R-5 | Adding tokens to `tailwind.css` without the matching `@theme inline` row leaves the named utility ungenerated, and the class silently does nothing | low | high | each of the five tokens gets its `--color-riv-danger-*: var(--riv-danger-*)` row in the same commit; AC-5's `toHaveCSS` on a real render is what catches a missing mapping (a class list check could not) | ivopogace | closed — all five rows added in the phase-0 commit |
| R-6 | `confirm-with-reason.ts` lives in `shared/`, so migrating it changes any future non-porcelain consumer's appearance | low | low | that is the *point* of the migration (the issue's future-proofing rationale); today its only consumers are `admin-venue-photos` and `admin-operators`, both porcelain — verified, and `shared/confirm-panel.ts` is a TSDoc cross-reference only, not a dependency | ivopogace | open |
| R-7 | An existing unit/e2e spec pins one of the literals and breaks | low | low | verified none does: `grep -rn 'b3261e\|8f2c22\|0a5f73\|179, *54, *43' frontend/src --include=*.spec.ts frontend/e2e` returns nothing. Re-run before phase 1 | ivopogace | closed — re-run at phase 1 step 1, still nothing |
| R-8 | The plan-file-structure guard fails the PR on a path this section does not list | med | low | run `node scripts/check-plan-file-structure.mjs --diff origin/main` before every push, **with the plan doc staged** — unstaged, the guard short-circuits and passes | ivopogace | open |

## Open questions / Assumptions

**None open.** The two slice-level questions were put to the maintainer at plan time and are
resolved below (OQ-1, OQ-2); OQ-A…OQ-D are the issue-intake grill's findings. The one item
that can re-open this section is **R-3**: if phase 0's contrast spec finds the Erase
button's border below 3:1, that becomes a recorded finding with a follow-up issue — never a
silent value change.

### Resolved

- **OQ-1 — the two destructive buttons keep different token families.** Maintainer
  decision: leave it. `shared/confirm-with-reason.ts`'s bare outlined button reads
  `--riv-error-ink`; `admin-privacy.ts`'s tinted Erase button reads `--riv-danger-*`. The
  families track the two *treatments*, which genuinely differ (border + label, no fill, on
  a row card vs. a tinted action inside a tinted panel), and this is what keeps every
  erasure-panel value byte-identical — the zero-drift outcome. **Rejected:** consolidating
  the ink (would turn two `preserved` ledger rows into `changed` for no visual gain, and
  drop `--riv-danger-ink` entirely), and unifying the two treatments (a redesign of a
  `shared/` component with two live consumers — its own issue, with its own before/after).
  *Consequence:* the split is invisible in the code, so the phase 2 commit body must state
  it; the Behavior-parity ledger already carries it row by row.
- **OQ-2 — the dark `--riv-danger-ink` is `#ffa9a1`, the same value as the dark
  `--riv-error-ink`.** Maintainer decision. The dark palette does not need two
  near-identical light reds nobody could distinguish on a dark card; porcelain keeps the
  families distinct (`#a3160e` error vs `#8f2c22` danger), dark deliberately does not.
  Because that asymmetry reads like an oversight, phase 0 states it in a comment beside the
  dark block. AC-4 still proves the value by maths rather than assertion. **Rejected:** a
  distinct dark danger ink (invents a value no one can currently see), and declaring the
  danger set porcelain-only (re-creates exactly the latent trap #829 exists to remove — the
  first non-porcelain consumer would paint `#8f2c22` on a dark ground).

- **OQ-A — the issue's "`#ffa9a1` in the dark themes" (plural) is wrong.** Only
  `[data-riv-theme='dark']` overrides `--riv-error-ink`; the `riviera` block
  (`tailwind.css:255–291`) does **not**, so under `riviera` the token resolves to the
  `:root` value `#a3160e`. That is **correct, not a gap**: riviera's cards are *light*
  (`--riv-card-glass: rgba(255,255,255,0.78)`), so a dark red is the right ink there. Only
  `dark` has dark cards (`rgba(16,26,46,0.86)`). The same reasoning is why the new
  `--riv-danger-*` set is declared in the `:root`/porcelain block and the `dark` block, and
  deliberately **not** in `riviera`. — *Outcome:* the plan's token layout follows the
  existing error-ink layout exactly; the issue's step 2 wording ("check the dark themes
  actually resolve `#ffa9a1`") narrows to the one `dark` theme.
- **OQ-B — the issue's `grep` under-counts.** `grep -rn 'text-\[#b3261e\]'` misses the
  three `border-[#b3261e]`. The mechanism-complete form is
  `grep -rno '\[#b3261e\]' frontend/src --include=*.ts --include=*.html` → 18 occurrences,
  15 `text-` + 3 `border-`, across 15 utility lines in 10 files (three lines carry two each:
  `confirm-with-reason.ts:62`, `admin-operators.ts:157`, `app.html:6`). Excluding the
  banner: **16 occurrences in 9 files** — `app.html` drops out entirely, it has only that
  line. Re-verified against `main` `0b34726`. — *Outcome:* AC-1 and AC-2 are written as the
  mechanism-complete commands.
- **OQ-C — the three danger/status affordances take `--riv-error-ink`.** Maintainer
  decision: `confirm-with-reason.ts:62` (destructive button), `admin-operators.ts:157`
  (Suspended badge) and `admin-privacy.ts:237` (`Erased` term) are not error *messages*, but
  they take the error-ink token rather than a new duplicate-valued token — one red across
  the console, nothing extra to keep in sync. Its `Kept` sibling
  (`admin-privacy.ts:239`, `#0a5f73`) migrates to `--riv-accent-ink` in the same slice so
  the definition-list pair carries no literal.
- **OQ-D — a second red family exists, and is in scope.** Not in the issue or either
  comment: `admin-privacy.ts:129` and `:163` paint `text-[#8f2c22]` over
  `border-[rgba(179,54,43,0.35)] bg-[rgba(179,54,43,0.06)]` (panel) and
  `border-[rgba(179,54,43,0.6)] bg-[rgba(179,54,43,0.1)]` (button) — a third red,
  `#b3362b`. Maintainer decision: **include it**, as a designed `--riv-danger-*` token set
  rather than a substitution, so the console ends with one registered danger treatment
  instead of a fourth literal family. This is what widens the slice from a one-utility
  sweep to a token-design phase (phase 0).

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` No component in scope reads or writes
`availability(set_id, booking_date)`, and no HTTP call is added, removed, or re-ordered:
the diff changes the *value* of colour utilities on elements that already exist.

## Spring Modulith — modules, interfaces, events

`N/A — frontend-only.` No file under `platform/` is touched; no module, port, or event
changes. Module ownership (§4a): not applicable — nothing moves between backend modules.

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` The Commissions tab is touched, but only at three
error-message colour positions; no commission or payout arithmetic is read or changed.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/confirm-with-reason.ts` | existing | standalone component (inline template) | unchanged | unchanged |
| FE-2 | `admin/admin-audit.ts` · `admin-commissions.ts` · `admin-mail-delivery.ts` · `admin-mail-outbox.ts` · `admin-operators.ts` · `admin-refund-outbox.ts` · `admin-venue-photos.ts` | existing | standalone components (inline templates) | unchanged | unchanged |
| FE-3 | `admin/admin-privacy.ts` | existing | standalone component | unchanged | unchanged — the erasure panel's tints move to tokens, the Signal Forms wiring is untouched |
| FE-4 | `src/tailwind.css` | existing | global token sheet | — | — |
| FE-5 | `admin/admin-console.contrast.spec.ts` | **new** | Vitest contrast spec (pure maths, jsdom) | — | — |
| FE-6 | `e2e/admin-token-inks.e2e.ts` | **new** | Playwright, mocked suite | — | — |

**Standards:** no Angular API is added or changed by this slice — every edit is inside an
existing inline template's `class` string. Confirmed via the angular-cli MCP that Emulated
view encapsulation scopes only a component's own `styles`/`styleUrls`, so the global
`tailwind.css` utilities keep reaching these templates. **No SCSS is created** (none exists
under `frontend/src`; RV-FE-7 has nothing to flag).

**Token registry placement** (`riviera-frontend` §Theming): the five new tokens go in
`tailwind.css` **only** — one declaration block per theme plus one `@theme inline` mapping
row each. `core/theme.ts` is deliberately **not** touched: that registry carries only what
the theme-switcher UI displays, and this slice adds no theme.

## FE↔BE contract

`N/A — no contract change.` No endpoint, DTO, or client typing is touched.

## Execution status

**Stage pointer:** `implement — phase 1 done`. The danger token set is registered, the
contrast proof is green, and the 16 in-scope `#b3261e` occurrences now read
`--riv-error-ink`. Draft PR **#833** is open (CI vehicle).

**Next action:** Phase 2 — the erasure panel's three sites and the `Kept` term.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Danger token set + contrast proof | ✅ | `Register the admin danger treatment as --riv-danger-* tokens (#829)` |
| 1 — The 16 `#b3261e` occurrences → `--riv-error-ink` | ✅ | `Paint the admin error ink from --riv-error-ink (#829)` |
| 2 — The erasure panel → `--riv-danger-*`, `Kept` → `--riv-accent-ink` | | |
| 3 — Computed-style drift verification + e2e pin | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Phase 0 outcome.** The plan's dark candidate values passed the AA maths **unchanged** —
no tuning was needed, so R-2 closes on the values as planned. Two departures from the phase-0
step list, both additive:

- The spec carries a **fourth** test, `'the accent ink the Kept term moves to meets AA on the
  card glass'`. `Kept`'s `#0a5f73` → `--riv-accent-ink` (`#085a6e`) is one of the six intended
  value changes in the Behavior-parity ledger, and it was the only one with no contrast proof
  anywhere. Ratios rise 6.56→7.05 … 7.25→7.78 across the porcelain stops.
- `testing/glass-tokens.ts` also gains `ERROR_INK` and `ACCENT_INK` (the light-theme values;
  only the `DARK_*` counterparts existed), which the File-structure list already anticipated.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | phase 0 contrast maths (R-3, pre-existing) | The erasure panel's **non-text** boundaries are below WCAG 1.4.11's 3:1 on `main` today, and the token migration preserves them byte-identically: the Erase button's `rgba(179,54,43,0.6)` border measures **2.60–2.69:1** over the panel fill (matching the plan's hand-computed ≈2.6:1), and the panel's own `rgba(179,54,43,0.35)` border **1.74–1.76:1** over the card glass. Per R-3 this is recorded, **not** adjusted — changing it is a visual decision outside a token migration. The dark candidates clear the button border (3.44–3.68:1) but not the panel border (2.29–2.32:1). The contrast spec's scope is text pairs (1.4.3) and its header says so. | follow-up issue at close-out |

---

## File structure

> Run before every push, **with this doc staged**:
> `node scripts/check-plan-file-structure.mjs --diff origin/main`

- `docs/plans/admin-error-ink-tokens.md` — this plan (guard-exempt; listed for completeness)
- `frontend/src/tailwind.css` — five `--riv-danger-*` declarations in the `:root`/porcelain
  block and again in the `dark` block, plus five `--color-riv-danger-*` rows in `@theme inline`
- `frontend/src/testing/glass-tokens.ts` — `DANGER_INK`, `DANGER_FILL`, `DANGER_BORDER`,
  `DANGER_ACTION_FILL`, `DANGER_ACTION_BORDER`, `ERROR_INK`, `DARK_DANGER_*` constants, so the
  values live in one place the specs read rather than being re-typed per spec
- `frontend/src/app/admin/admin-console.contrast.spec.ts` — **new**; the admin console's single
  contrast home, modelled on `operator/operator-console.contrast.spec.ts` (same porcelain-pinned
  argument), covering both admin surfaces
- `frontend/src/app/shared/confirm-with-reason.ts` — line 62, border + label
- `frontend/src/app/admin/admin-audit.ts` — line 37
- `frontend/src/app/admin/admin-commissions.ts` — lines 74, 164, 225
- `frontend/src/app/admin/admin-mail-delivery.ts` — line 82
- `frontend/src/app/admin/admin-mail-outbox.ts` — line 48
- `frontend/src/app/admin/admin-operators.ts` — lines 55, 157 (border + label)
- `frontend/src/app/admin/admin-privacy.ts` — lines 104, 129, 163, 182, 237, 239 (all three
  families: error ink, danger set, accent ink)
- `frontend/src/app/admin/admin-refund-outbox.ts` — line 35
- `frontend/src/app/admin/admin-venue-photos.ts` — line 78
- `frontend/e2e/admin-token-inks.e2e.ts` — **new**; the computed-style pin (AC-5, AC-7).
  Placement in the **CI-safe mocked** suite is deliberate (no backend needed); RV-FE-E2E owns
  the final call at review

> Line numbers are as of `main` `0b34726` and will drift; the `grep` in AC-1/AC-2 is the
> authority, not this list.

---

## Phase 0 — The danger token set + its contrast proof

**Files:** Modify `frontend/src/tailwind.css` · Modify `frontend/src/testing/glass-tokens.ts` ·
Create `frontend/src/app/admin/admin-console.contrast.spec.ts`

- [x] **Step 1: Write the failing test.** `admin-console.contrast.spec.ts`, importing danger
  constants that do not exist yet (red = module resolution failure, which is the honest red
  for a values-first slice). Shape, following `operator-console.contrast.spec.ts`:

```ts
import { AA_NORMAL, composite, contrastRatio, rgbToHex } from '../../testing/contrast';
import {
  DANGER_ACTION_FILL, DANGER_FILL, DANGER_INK,
  DARK_CARD_GLASS, DARK_DANGER_ACTION_FILL, DARK_DANGER_FILL, DARK_DANGER_INK, DARK_STOPS,
  ERROR_INK, PORCELAIN_CARD_GLASS, PORCELAIN_STOPS, surfaceOver,
} from '../../testing/glass-tokens';

/**
 * WCAG-AA contrast guard for the admin console. The console is ALWAYS porcelain (its host
 * scopes `data-riv-theme="porcelain"`, admin-console.ts:59), so the porcelain rows are the
 * live proof; the dark rows exist because `shared/confirm-with-reason.ts` and the danger
 * token set are reachable from outside this console, and a latent value nobody proved is
 * how #829's own "dark-red ink on a dark ground" case got written in the first place.
 *
 * <p>Two surfaces, not one: the tab bodies put error text directly on the page background
 * (`admin-commissions.ts` loading/error paragraphs use `text-riv-ink*`, the shell's ink),
 * while the cards put it on `--riv-card-glass`. Both are asserted.
 */
```

  Tests: (a) `ERROR_INK` meets AA over both porcelain surfaces; (b) the migration does not
  lower contrast — same pair recomputed with `#b3261e` must be `<=` the `#a3160e` result;
  (c) `DANGER_INK` meets AA over `DANGER_FILL` over the card, and over `DANGER_ACTION_FILL`
  over `DANGER_FILL` over the card; (d) the same danger pairs in dark, over
  `DARK_CARD_GLASS`/`DARK_STOPS`.

- [x] **Step 2: Run it, verify it fails** —
  `npm test -- src/app/admin/admin-console.contrast.spec.ts` → FAIL, unresolved imports.

- [x] **Step 3: Minimal implementation.** Add to `tailwind.css`'s `:root, [data-riv-theme='porcelain']`
  block, beside `--riv-error-ink`:

```css
  /* The erasure confirm panel's danger treatment (#829): a tinted panel + a stronger
     tinted action inside it. Pre-composed rgba (not a Tailwind /opacity modifier, which
     compiles to color-mix(in oklab, …) and changes both the interpolation space and the
     computed-style string) — matching --riv-field-border / --riv-card-glass. */
  --riv-danger-ink: #8f2c22;
  --riv-danger-fill: rgba(179, 54, 43, 0.06);
  --riv-danger-border: rgba(179, 54, 43, 0.35);
  --riv-danger-action-fill: rgba(179, 54, 43, 0.1);
  --riv-danger-action-border: rgba(179, 54, 43, 0.6);
```

  and to `[data-riv-theme='dark']` (candidate values — the spec is the gate, adjust to pass):

```css
  /* Deliberately the same ink as --riv-error-ink here (OQ-2): porcelain distinguishes the
     error and danger reds, the dark palette does not — two near-identical light reds on a
     dark card would be noise. Not an oversight; do not "fix" the duplication. */
  --riv-danger-ink: #ffa9a1;
  --riv-danger-fill: rgba(255, 138, 122, 0.1);
  --riv-danger-border: rgba(255, 138, 122, 0.42);
  --riv-danger-action-fill: rgba(255, 138, 122, 0.16);
  --riv-danger-action-border: rgba(255, 138, 122, 0.66);
```

  and five rows to `@theme inline` beside `--color-riv-error-ink`:

```css
  --color-riv-danger-ink: var(--riv-danger-ink);
  --color-riv-danger-fill: var(--riv-danger-fill);
  --color-riv-danger-border: var(--riv-danger-border);
  --color-riv-danger-action-fill: var(--riv-danger-action-fill);
  --color-riv-danger-action-border: var(--riv-danger-action-border);
```

  **`riviera` gets no block** — its cards are light (`rgba(255,255,255,0.78)`), so it
  inherits the porcelain values, exactly as `--riv-error-ink` already does (OQ-A).

- [x] **Step 4: Run it, verify it passes** — `npm test -- src/app/admin/` → PASS.
  If a **dark** row fails, adjust the candidate value and re-run; if a **porcelain** row
  fails, that is R-3 — record it, do not change the value.

- [x] **Step 5: Generalization-audit pass.** Population `every colour position in
  frontend/src still written as a hex or rgba literal rather than a --riv-* token` →
  enumerate
  `grep -rnoE '(text|bg|border|fill|stroke|shadow)-\[(#[0-9a-fA-F]{3,8}|rgba?\()' frontend/src --include=*.ts --include=*.html`
  → judge each hit against the two documented exemption classes (a recorded deliberate
  deviation like `app.ts:59–69`; a value inside a composite arbitrary expression). Record
  the residue in the log below and open one follow-up issue for it — do **not** widen this
  slice.

- [x] **Step 6: Commit** — `git commit -m "Register the admin danger treatment as --riv-danger-* tokens (#829)"`

- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — The 16 `#b3261e` occurrences → `--riv-error-ink`

**Files:** Modify `shared/confirm-with-reason.ts:62` · `admin/admin-audit.ts:37` ·
`admin-commissions.ts:74,164,225` · `admin-mail-delivery.ts:82` · `admin-mail-outbox.ts:48` ·
`admin-operators.ts:55,157` · `admin-privacy.ts:104,182,237` · `admin-refund-outbox.ts:35` ·
`admin-venue-photos.ts:78`

- [x] **Step 1:** Re-run R-7's check — no spec pins the literal — then re-run AC-1's grep to
  confirm the population is still 18/10 files against current `main`.
- [x] **Step 2:** Replace `text-[#b3261e]` → `text-riv-error-ink` and `border-[#b3261e]` →
  `border-riv-error-ink` at all 16 in-scope occurrences. **Do not touch `app.html:6`** (R-1).
- [x] **Step 3:** `npm test -- src/app/admin/ src/app/shared/confirm-with-reason.spec.ts` → PASS
  (nothing should move; the specs query `data-testid`, not colours).
- [x] **Step 4:** `npm run lint && npm run format:check` → clean.
- [x] **Step 5: Generalization audit** — none needed; phase 0 already swept the mechanism.
- [x] **Step 6: Commit** — `git commit -m "Paint the admin error ink from --riv-error-ink (#829)"`
- [x] **Step 7: Update plan-doc execution status.**

---

## Phase 2 — The erasure panel → `--riv-danger-*`, `Kept` → `--riv-accent-ink`

**Files:** Modify `admin/admin-privacy.ts:129,163,239`

- [ ] **Step 1:** `:129` → `text-riv-danger-ink`. `:163` →
  `border-riv-danger-action-border bg-riv-danger-action-fill text-riv-danger-ink`.
  The panel at `:127` → `border-riv-danger-border bg-riv-danger-fill`. `:239` →
  `text-riv-accent-ink`.
- [ ] **Step 2:** `npm test -- src/app/admin/admin-privacy` → PASS.
- [ ] **Step 3:** AC-2's grep → 0 occurrences.
- [ ] **Step 4: Commit** — `git commit -m "Paint the erasure panel from the danger tokens (#829)"`
- [ ] **Step 5: Update plan-doc execution status.**

---

## Phase 3 — Computed-style drift verification + the e2e pin

**Files:** Create `frontend/e2e/admin-token-inks.e2e.ts`

- [ ] **Step 1: The drift proof (issue step 3).** With the mocked e2e driving each admin tab,
  capture `getComputedStyle` for every migrated element **before** (at `main`) and **after**,
  and diff. Every moved property must be one of the six intended value changes in the
  Behavior-parity ledger; anything else — a dropped `cursor`, a changed `transition`, a
  border-width shift — is a regression, not a colour decision. (Chromium snaps `border-width`
  to the device pixel; `1.5px` reading as `"1px"` is not a regression — `riviera-tailwind`
  GOTCHA.) Paste the diff into the AC-verification section.
- [ ] **Step 2:** Write `admin-token-inks.e2e.ts` — `toHaveCSS` on one representative element
  per family (AC-5) plus the porcelain-pin test under a `dark` document theme (AC-7).
- [ ] **Step 3:** `npm run test:e2e:a11y` → PASS, including every existing admin spec's
  `expectNoSeriousAxeViolations` (AC-6).
- [ ] **Step 4:** `node scripts/check-plan-file-structure.mjs --diff origin/main` (plan doc
  staged) · `node scripts/check-touch-target.mjs --diff origin/main` · `npm run lint` ·
  `npm run format:check` → all clean.
- [ ] **Step 5: Commit** — `git commit -m "Pin the admin token inks against a real render (#829)"`
- [ ] **Step 6: Update plan-doc execution status**, then mark the PR ready for review.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-30 | phase 0 step 5 | every colour position still written as a literal rather than a `--riv-*` token | `grep -rnoE '(text\|bg\|border\|fill\|stroke\|shadow)-\[(#[0-9a-fA-F]{3,8}\|rgba?\()' frontend/src --include=*.ts --include=*.html` | **380 occurrences** (336 outside `*.spec.ts`), in **62** non-spec files: `operator/` 119, `booking/` 84, `shared/` 63, `admin/` 31, `venue/` 20, `auth/` 8, `pages/` 6, app shell 5 | **Follow-up issue, slice not widened.** The residue is app-wide and mostly *not* this mechanism: the bulk is per-state palettes inside arbitrary variant expressions (`shared/status-chip.ts`, `semantic-chip.ts`, `amenity-chip.ts`, `operator/beach-cell.ts`, `venue/day-availability.ts` — exemption class 2, a value inside a composite arbitrary expression), plus `app.html:6`'s recorded deliberate deviation (exemption class 1). What #829 owns — the red families under `admin/` and `shared/confirm-with-reason.ts` — is phases 1–2; the teal `#0a4f5e`/`#0a5f73` family is the Non-goals' separate accent sweep. Deciding which of the remaining 336 want tokens is a design pass, not a sweep |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `grep -rno '\[#b3261e\]' frontend/src --include=*.ts --include=*.html | wc -l` → `2`, both on `app.html:6`.
- [ ] **AC-2:** `grep -rno '#8f2c22\|179, *54, *43\|#0a5f73' frontend/src --include=*.ts --include=*.html | wc -l` → `0`.
- [ ] **AC-3/AC-4:** `npm test -- src/app/admin/admin-console.contrast.spec.ts` → PASS.
- [ ] **AC-5/AC-7:** `npm run test:e2e:a11y -- admin-token-inks` → PASS.
- [ ] **AC-6:** `npm run test:e2e:a11y` → PASS (full mocked suite).
- [ ] Computed-style before/after diff pasted here, every moved property accounted for.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [ ] **Availability** section justified N/A (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — N/A.
- [ ] **Modulith** section justified N/A (invariant #11).
- [ ] **Payment/payout** section justified N/A (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10) — N/A.
- [ ] Timezone correct (invariant #6) — N/A.
- [ ] Booking codes unguessable (invariant #7) — N/A.
- [ ] Flyway migration present for schema changes (invariant #12) — N/A, no schema change.
- [ ] **Frontend** standards met; no new SCSS; every colour position uses a named token
      utility, not a literal (RV-FE / `riviera-tailwind`).
- [ ] `app.html:6`'s deliberate deviation is intact and its TSDoc still accurate.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #) —
      incl. R-3's follow-up if the contrast spec finds a sub-3:1 boundary.
- [ ] Follow-up issues opened: the `#0a4f5e` teal sweep, and phase 0's literal residue.
- [ ] **Close-out written in THIS PR**, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — the `references/pr-gates.md` §1 ladder *plus*
      `riviera-review-overlay`, not the overlay alone.
