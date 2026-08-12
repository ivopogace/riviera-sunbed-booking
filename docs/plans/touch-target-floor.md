# A 44 px touch-target floor across every interactive surface — Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** every visible interactive control in the app — operator console, platform-admin
console, auth, booking and tourist pages — presents a **≥ 44 × 44 CSS px** hit area at a 390 px
viewport, with the floor stated once as a convention, carried by one directive, and proven by a
generic per-surface Playwright sweep that measures *every* control rather than a named list.

**Architecture:** the floor is expressed as a single attribute directive — `shared/touch-target.ts`
(`[appTouchTarget]`, host `class` = `min-h-11 min-w-11`) — applied to native `<button>`/`<a>`/`<input>`
/`<select>`. That shape is what Angular's own a11y guide prescribes for a reusable control treatment
(*"instead of creating a custom element for a new variety of button, create a component that uses an
attribute selector with a native `<button>`"* — the `MatButton` pattern), what `riviera-tailwind`
rule 1 requires (share at the directive layer; `@apply`/`@utility` are forbidden here), and what the
repo already does twice (`shared/busy-action.ts`, `shared/amenity-chip.ts`). The **proof** is
deliberately not the class list: a generic e2e sweep measures `getBoundingClientRect()` on every
visible control per surface, so a control that carries the directive but is still short — an inline
`<a>` ignoring `min-height`, a grid tile squeezed by its column — fails honestly.

**Persistence:** N/A — frontend-only slice; no tables, no migrations, no Flyway version claimed.

**Source of intent:** GitHub issue **#605** (deferred from the #600 generalization audit, recorded
in `docs/plans/per-set-beach-map-editing.md` phase 4). Scope widened from the issue's six operator
tabs to the whole app, and the map-grid exemption declined, both by the maintainer at plan time
(see *Resolved* in Open questions).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that the
issue's `rg` inventory saw only `operator/*.html`, missing the inline `template:` literals, the SCSS
tab nav, and every surface outside `operator/`) · `riviera-plan-doc` (this template — forced the
behavior-parity ledger, which is where the daily-grid geometry change stopped being "mechanical") ·
`tdd` (each phase's sweep spec goes red on the unfixed surface before the classes land) ·
`riviera-review-overlay` (review gate — due at ready-for-review; RV-FE-E2E governs the sweep's
suite placement) · `riviera-docs-freshness` (`N/A — pending; due at merge close-out step 5 over the
PR's own merge span, since this slice adds a stated convention to `riviera-tailwind``) ·
`riviera-tailwind` (ruled out `@apply`/`@utility` for the shared floor and pushed it to a directive;
supplied the no-drift rule that makes computed geometry, not classes, the proof) · `riviera-frontend`
(placed the directive in `shared/` — pure, stateless, presentational — and the sweep in
`frontend/e2e/`, the CI-run mocked suite) · `angular-developer` + angular-cli MCP
(`search_documentation`: Angular's a11y guide has **no** touch-target opinion — it is ARIA, focus and
routing only — but prescribes the attribute-selector-on-a-native-element pattern this slice uses) ·
`playwright-cli` (web-first `expect`, no fixed sleeps, test-id/role locators in the sweep helper).

**Branch:** `feature/touch-target-floor` <must exist in git before phase 0>

---

## Acceptance criteria (testable)

> These are frontend-surface criteria; there is no inner hexagon in play (no backend in scope), so
> each AC is phrased against the rendered surface — the application boundary this slice actually has.

- [ ] **AC-1:** Given any console, admin, auth, booking or tourist route rendered at a 390 × 780
      viewport, when every visible `button` / `input` / `select` / `textarea` / `[role="button"]` /
      `a` on it is measured, then each reports `width ≥ 44` **and** `height ≥ 44`, except elements
      carrying an explicit `data-touch-exempt="<reason>"`. *Pinned by:*
      `touch-targets.e2e.ts` → `expectTouchTargets`, one test per surface.
- [ ] **AC-2:** Given the sweep runs against a surface where one control has been reverted to its
      pre-slice classes, when the spec executes, then it **fails** and names that control's
      selector and measured size. *Pinned by:* the red run recorded per phase in Execution status
      (each phase's step 2), not by a committed always-red test.
- [ ] **AC-3:** Given `<button appTouchTarget>` in a host fixture, when the component renders, then
      the host element carries `min-h-11` and `min-w-11` and the consumer's own classes are
      **retained** (Angular 22 merges a static `class` with a host `[class]`/`class` binding rather
      than replacing it). *Pinned by:* `shared/touch-target.spec.ts`.
- [ ] **AC-4:** Given the operator daily-view availability grid at a 390 px viewport for a venue
      whose widest row has 12 sets, when it renders, then every tile is ≥ 44 × 44, the grid scrolls
      **horizontally inside its own frame**, and `document.documentElement` does **not** scroll
      sideways. *Pinned by:* `operator-daily.e2e.ts` → *"tiles stay tappable at a phone width"*.
- [ ] **AC-5:** Given a staff member taps a set tile in the daily view after the geometry change,
      when the tap resolves, then the same walk-in mark/unmark request is issued as before, and the
      tile's state classes and `data-state` hook are unchanged. *Pinned by:*
      `daily-view-tab.spec.ts` (existing suite, must stay green unmodified).
- [ ] **AC-6:** Given `riviera-tailwind`, when a reader looks for the project's touch-target rule,
      then a stated section gives the floor (44 px), the directive to use, the two documented
      exemption classes (inline prose links; anything the sweep would measure inside a third-party
      iframe), and names the sweep as the proof. *Pinned by:* the docs-freshness pass at close-out;
      no automated test.

## Non-goals

- **No static class-based guard script.** A regex can see `min-h-11` but not computed height, so it
  would both miss real failures (an inline `<a>` that ignores `min-height`) and flag correct code
  (`py-3 text-[14px]`, already 44 px). The e2e sweep is the check. A guard becomes *coherent* once
  the directive exists — "every interactive element carries `[appTouchTarget]` or `data-touch-exempt`"
  is regex-checkable — but it is a **follow-up**, filed at close-out, not this slice.
- **No restyling beyond geometry.** Colours, radii, fonts, shadows and spacing rhythm stay as they
  are; only `min-height`/`min-width`/padding and, for the two map grids, column sizing change.
- **The Stripe Payment Element's own fields.** They render inside a cross-origin iframe; the sweep
  cannot descend into it and we cannot restyle it. Documented as an exemption class, not fixed.
- **No change to the WCAG target.** 44 px (2.5.5 Enhanced / iOS HIG) is the adopted figure, as #600
  set it; this slice propagates it, it does not re-open it.
- **No new e2e suite.** The sweep lands in `frontend/e2e/` (CI-run, mocked), per RV-FE-E2E.
- **No backend change.** No endpoint, DTO, module or migration is touched.

## Behavior-parity ledger

> The slice changes the geometry of two shipped surfaces (the daily availability grid and the
> layout-editor paint grid). Everything else is a padding/min-size change on controls whose behavior
> is untouched. The ledger covers the two grids, because "just make the tiles bigger" is exactly the
> claim that hides a dropped behavior.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Daily grid: every row's sets share the row width equally (`repeat(n, minmax(0, 1fr))`), so a 20-set row squeezes to ~15 px tiles at 390 px | **changed** | `repeat(n, minmax(44px, 1fr))` — tiles never squeeze below the floor; a row wider than the frame scrolls horizontally inside it (the pattern `set-editor.html:218` already uses) |
| Daily grid: the whole map is visible without horizontal scrolling on a phone for a typical venue | **changed** | still true up to ~7 columns at 390 px; wider venues now scroll **inside the frame**. The page itself still never scrolls sideways (asserted, AC-4) |
| Daily grid: tap a tile → mark/unmark walk-in; optimistic state; `data-state` + tier classes as test hooks | preserved | tile markup, handlers, `data-state`, `.set-tile`/`.premium` hooks all unchanged — only `h-8` → `min-h-11 min-w-11`. Pinned by AC-5 |
| Daily grid: `[disabled]="isPending(set)"` while a tile's write is in flight | preserved | untouched. **Not** converted to `[appBusy]` here — that is a focus-posture change, out of scope, and BUSY-1 only fires on a `[disabled]` line the diff *adds* (`check-focus-posture.mjs:362`), which this diff does not |
| Daily grid: row-label gutter (`w-5`) beside each row | **changed** | the plan intended to pin the gutter outside the scroller; the shipped code puts it **inside**, so a label scrolls with its row. That is what the sibling `set-editor` grid already does (#600), and matching a shipped sibling beat inventing a sticky-label behaviour only one of the two console grids would have |
| Layout editor: paint by click and by drag across a `repeat(cols, minmax(0, 1fr))` grid | **changed** (geometry only) | same `minmax(44px, 1fr)` + in-frame scroll. Drag-paint is pointer-position based and unaffected by cell size; re-verified by the existing layout-editor e2e |
| Layout editor: the whole R×C grid fits the frame after Generate | **changed** | a generated grid wider than the frame now scrolls inside it rather than squeezing |
| Console tab nav (`.oc-tab`): pill row that **wraps** at narrow widths, never overflowing the page (#170, asserted in `operator-console.e2e.ts`) | preserved | the SCSS gains `min-height: 44px` + `display: inline-flex; align-items: center`; the row still wraps, it just wraps sooner. The existing overflow assertion is the guard |
| Header links (`.oc-create-venue`, sign-out): inline links/buttons in the header row | preserved | become `inline-flex` with the floor; the header row already wraps (`flex-wrap`) |
| Footer `Privacy` · `Terms`, and prose links inside sentences | preserved, **exempted** | marked `data-touch-exempt="inline prose link (WCAG 2.5.5 inline exception)"` — a decision recorded in markup, which is the property #605 asked for |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | `min-h-11` silently does nothing on an inline `<a>` (`min-height` does not apply to non-replaced inline boxes), so the tab nav and header links *look* fixed and are not | **high** | high | the directive's TSDoc states it; the SCSS/utility change pairs `min-height` with `inline-flex`; and the sweep measures geometry, not classes, so a no-op fails the build | plan | open |
| R-2 | The 44 px **width** half is the hard one: a 12-set row cannot give 44 px per column at 390 px without scrolling. Fixing height alone would satisfy a height-only assertion and still miss WCAG | **high** | high | AC-1 asserts **both** dimensions; the grids move to `minmax(44px, 1fr)` + `overflow-x-auto` inside the frame (AC-4) | plan | open |
| R-3 | A generic sweep is brittle: it will trip on a control that is legitimately small, and the temptation is to weaken the assertion | med | med | one escape hatch only — `data-touch-exempt="<reason>"`, greppable and reviewable; the reason string is mandatory. **Never** loosen the 44 to make a surface pass | implementer | open |
| R-4 | The sweep measures hidden/zero-size controls (`venue-tab`'s `class="hidden"` file input) and fails on them | med | low | the helper skips any element with no box, zero area, `visibility: hidden`, or `display: none` — measured via `boundingBox()` being null/zero, not via a class list | implementer | open |
| R-5 | Taller controls push a surface's content down and break an existing layout/overflow assertion | med | med | **It fired — as F-2, on a surface phase 1 never swept.** Mitigation held: the layout was fixed (redundant header padding removed) and the assertion left untouched | implementer | **closed — fixed in `c87a776b`** |
| R-6 | Prettier reformats the long class strings and the diff balloons past the real change | med | low | `npm run format` before each commit (whole-scope Prettier is a CI gate since #631); review the diff for reflow-only hunks and keep them in their own commit if large | implementer | open |
| R-7 | ~145 controls + ~56 anchors across ~40 files is a large mechanical diff; a missed file reads as "the sweep covered it" | med | med | the sweep is per **surface/route**, not per file — a missed control on a covered route fails. Routes not covered by a sweep test are listed explicitly in phase 5 | implementer | open |
| R-8 | Touching a control's `class` line pulls a neighbouring `[disabled]` into the focus-posture guard's judged region | low | low | it does not: `check-focus-posture.mjs:362` requires the `[disabled]` **line itself** to be diff-added. Verified by reading the script; re-verify by running `node scripts/check-focus-posture.mjs --diff origin/main` per phase | plan | open |
| R-10 | ~~Promoting the duplicated `mockConsole`/`signIn` into `support/` touches seven shipped operator specs~~ | — | — | **Dropped at phase 0.** The copies are not copies: they are per-tab, stateful, differently named (`mockRequests`, `signInAndOpenPayouts` — sign-in *and* navigate). Consolidating them is its own slice. Phase 0 instead **adds** `support/operator-console.mocks.ts`, a breadth-first read-only mock for the sweep, and leaves all ten specs untouched | plan | **closed — not applicable (`8ceffcb3`..)** |
| R-11 | A sweep over a surface that rendered its empty or error state passes **vacuously** — the exact failure `riviera-review-overlay` warns about for absence-asserting specs. Phase 0 hit this live: a mock built from guessed field names (`id`/`expiresAt` vs the real `bookingId`/`requestExpiresAt`) rendered an empty Requests tab, and the sweep went quiet on it | **high** | high | every surface test asserts a content marker before sweeping (`request-card` visible, etc.); mock payloads are read from `operator-console.model.ts`, never guessed | implementer | open |
| R-9 | The daily grid's in-frame horizontal scroll is a new keyboard/AT concern — a scroll container needs to be reachable | low | med | give the scrolling `<ul>` container `tabindex="0"` + an accessible name where it can actually overflow, matching what `set-editor.html`'s frame does; axe runs on the surface in the same spec | implementer | open |

## Open questions / Assumptions

- **Assumption:** WCAG 2.5.5's *inline* exception is the right basis for exempting prose links, and
  its *essential* exception is **not** invoked for the map grids (the maintainer declined that route).
  — *Owner:* Ivo · *Resolves by:* phase 2 review.
- **Assumption:** ~7 columns is where a 390 px daily grid starts scrolling (390 − 18×2 padding − 20
  gutter − gaps ≈ 310 px ÷ 44). The exact number is confirmed by measurement in phase 2, not by this
  arithmetic. — *Owner:* implementer · *Resolves by:* phase 2.
- **Open question:** does `pages/home`'s two filter `<select>`s meeting 44 px change the tourist
  hero's composition enough to need a design look? — *Owner:* Ivo · *Resolves by:* phase 4.

### Resolved

- **Scope — how wide does the sweep go?** → **operator + admin + tourist** (the whole app).
  Maintainer decision, 2026-08-12, at plan time. The issue's "not in scope: the tourist surfaces"
  is superseded.
- **The daily-view map tiles (`h-8`, 32 px)** → **raised to the floor like everything else**; no
  essential-layout exemption. Maintainer decision, 2026-08-12. This is what turns phase 2 from a
  padding change into a grid-geometry change (see the parity ledger).
- **How is the floor expressed?** → **a shared attribute directive + a stated rule in
  `riviera-tailwind`**, researched via the angular-cli MCP at the maintainer's request. Grounds:
  Angular's a11y guide prescribes exactly this shape for a reusable native-control treatment
  (`MatButton`); `riviera-tailwind` rule 1 forbids `@apply`/`@utility` and directs sharing to the
  directive layer; `[appBusy]` and `[appAmenityChip]` are the in-repo precedents. A directive also
  earns its keep at this scope in a way it would not have at the issue's original six tabs — ~200
  application sites and one edit point if the figure ever moves.
- **E2E proof** → **generic per-surface sweep** (maintainer choice), not enumerated test-ids.

## Availability & concurrency (invariant #2)

**N/A — does not affect availability.** The slice changes only the rendered size of controls. The
daily view's tap-to-mark control is *restyled*, not rewired: the same handler issues the same
walk-in mark/unmark request, so the single writer of `availability(set_id, booking_date)` and its
uniqueness constraint are untouched (AC-5 pins the parity). No booking, cutoff, or pool logic is in
scope.

## Spring Modulith — modules, interfaces, events

**N/A — frontend-only.** No backend file is in the diff.

### Module ownership (§4a)

**N/A — frontend-only; no backend capability added or moved.**

## Payment & payout (invariants #5, #8, #9, #10)

**N/A — no payment in scope.** The booking-pay page is restyled at the control level only; the
Stripe Payment Element itself is a cross-origin iframe and is an explicit Non-goal.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/touch-target.ts` | **new** | standalone attribute directive | none — static host `class` | — |
| FE-2 | `operator/` — 5 tabs + `venue-create-card` + console shell (`operator-console.html`/`.scss`), `operator-chrome`, `operator-home`, `payout-statement`, `stale-write-banner`, `scan-input`, `camera-qr-scanner` | existing | templates (external + inline) + one SCSS | unchanged | unchanged |
| FE-3 | `operator/daily-view-tab.html` + `operator/layout-editor.html` — the two map grids | existing | template + grid geometry | unchanged | unchanged |
| FE-4 | `admin/` — 8 files | existing | inline templates | unchanged | unchanged |
| FE-5 | `auth/` — 6 files | existing | templates | unchanged | Signal Forms untouched |
| FE-6 | `booking/` — 5 files, `venue/` — 1, `pages/home` — 1, `shared/` — 6 | existing | templates | unchanged | unchanged |
| FE-7 | `frontend/e2e/support/touch-targets.ts` | **new** | Playwright helper | — | — |

**Standards:** standalone directive, `host` metadata (no `@HostBinding`), no `standalone: true`, no
explicit `OnPush`. The directive carries a static host `class` — not a `[class]` computed — because
it has no variants; `AmenityChip`'s computed shape is for a directive that *does*. Angular 22 merges
a static template `class` with a directive host `class`, so consumers keep their own utilities
(AC-3 pins it).

## FE↔BE contract

**N/A — no contract change.** No request or response shape moves.

## Execution status

> **This section is the session-recovery anchor.** Long sessions get compacted
> (summarized) and lose fine-grained state; a fresh session starts with none.
> Everything a resuming session needs lives HERE, committed — never only in the
> conversation. After a context compaction, in a fresh session, or whenever unsure
> where the work stands: re-read this section (plus the current stage's
> `riviera-sdlc` reference file) before acting. Update it in the SAME commit window
> as the change it records — at every phase boundary AND every SDLC stage
> transition (plan → implement → CI → PR → review → sonar → merge).
>
> **Finalize this section BEFORE the merge, in the PR's own last commit** — stage pointer
> DONE, every phase row ✅ with its commit, Open Questions empty, every risk row closed with
> its outcome, AC pin-names matching the tests that shipped. Record **`merged via PR #NN`,
> never a merge SHA**.

**Stage pointer:** `implement — phases 0–3 complete; phase 4 next` · **draft PR #647** open. CI green
on phase 0; phase 1 went **red** and its two findings (F-1, F-2) are fixed in phase 2. The review +
Sonar gates fall due at ready-for-review, not while draft.

**Next action:** phase 4 — auth, booking, tourist pages and the remaining shared primitives.
`shared/confirm-with-reason.ts` was already floored in phase 3 (the admin gated states needed it);
`shared/confirm-panel.ts` has `min-h-11` but not `min-w-11`, so check the width half.

> **Phase 0's measurement rewrote the phase-1 estimate.** The sweep measured all 15 controls on the
> Requests tab: **the tab body is already compliant** — its accept/decline buttons wrap at 390 px and
> measure 161×64 and 89×64, not the ~42 px the plan's padding arithmetic predicted. All 11 failures
> are **console shell chrome** (`oc-create-venue` 87×20, `oc-change-password` 104×20, `oc-signout`
> 82×36, six `.oc-tab` pills at ×38) plus the two inline footer links (40×17, 34×17) that become
> `data-touch-exempt`. Phase 1 is therefore mostly **one SCSS file**, not five templates — but do not
> assume the other four tabs match the Requests tab's luck: measure each before concluding.
>
> The corollary for phases 2–4: **estimate nothing from padding arithmetic.** A wrapping flex row,
> `items-stretch`, and inherited line-height all move the rendered box, and only the sweep knows.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — The floor: directive, sweep helper, stated convention | ✅ | `676b83c4` |
| 1 — Operator console: 5 tabs + create card + shell chrome | ✅ | `425fdfbb` |
| 2 — The two map grids (geometry + in-frame scroll) | ✅ | `c87a776b` |
| 3 — Platform-admin console | ✅ | `50a9fba2` |
| 4 — Auth, booking, tourist pages, shared primitives | | |
| 5 — Coverage reconciliation + close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | CI (phase 1) | `Confirm decline` measured **43 × 163 on Linux** and 44 on Windows — it met the floor only through inherited line-height, never through an explicit rule | fixed in `c87a776b` — the directive now carries all five request-card actions, and every control on a swept surface is tagged rather than left to ambient metrics |
| F-2 | CI (phase 1) | Making the shared `operator-chrome` nav links 44 px grew that header **131.8 → 187 px**, pushing `#admin-pending-title` past the 360 px fold (797 vs < 740). The chrome is shared with `/admin`, which phase 1 never swept | fixed in `c87a776b` — the header's own `py-3` and row-gaps were the redundancy: with 44 px items supplying the rhythm, dropping them returns the header to **133 px** and the title to 685. Layout fixed, assertion untouched |

---

## File structure

> Every path in the diff. The mechanical sweep is entered as globs per the guard's documented
> idioms; run `node scripts/check-plan-file-structure.mjs --diff origin/main` before pushing.

- `docs/plans/touch-target-floor.md` — this plan
- `frontend/src/app/shared/touch-target.ts` — the `[appTouchTarget]` directive
- `frontend/src/app/shared/touch-target.spec.ts` — its unit spec (AC-3)
- `frontend/e2e/support/touch-targets.ts` — `expectTouchTargets(page, label)`, the generic sweep
- `frontend/e2e/support/operator-console.mocks.ts` — `mockWholeConsole`/`signInToConsole`: a new
  breadth-first read-only mock for the sweep. **Not** a promotion of the per-spec mocks (R-10);
  the ten existing operator specs are untouched
- `frontend/e2e/touch-targets.e2e.ts` — one test per operator surface (AC-1), each asserting a
  content marker first so an empty render cannot sweep vacuously (R-11)
- `frontend/e2e/touch-targets-admin.e2e.ts` — the same for the seven admin routes; a separate spec
  because the two consoles need different mocks and sign-in
- `frontend/e2e/support/admin-console.mocks.ts` — `mockWholeAdminConsole`, the admin twin of the
  operator mock
- `frontend/e2e/admin-console-stats.e2e.ts` — its measured fold-budget comment, refreshed
- `frontend/src/app/operator/` — every template and inline-template component with a control, plus
  `operator-console.scss` (the `.oc-tab` / `.oc-create-venue` rules)
- `frontend/src/app/app.html` — the **app-level** footer, shared by the tourist shell and the
  operator home; its Privacy/Terms links take the inline-prose exemption (phase 1)
- `frontend/src/app/admin/` — every inline template with a control
- `frontend/src/app/auth/`, `frontend/src/app/booking/`, `frontend/src/app/venue/`,
  `frontend/src/app/pages/`, `frontend/src/app/shared/` — same

> **Write a directory with a trailing slash, not `dir/**`.** The guard's `PATH_LIKE` requires a file
> extension and `DIR_LIKE` a trailing slash, so a `dir/**` token matches neither and is silently
> ignored — the section reads as covering the sweep while the guard counts nothing (caught at phase 1).
- `frontend/e2e/operator-daily.e2e.ts` — the daily-grid geometry test (AC-4)
- `frontend/e2e/operator-console.e2e.ts` — the existing narrow-viewport test, extended with the nav
- `.claude/skills/riviera-tailwind/SKILL.md` — the stated convention (AC-6)
- `CLAUDE.md` — one line recording the floor as a project-wide convention (docs-freshness sweep)

---

## Phase 0 — The floor: directive, sweep helper, stated convention

**Files:** Create `frontend/src/app/shared/touch-target.ts` · `frontend/src/app/shared/touch-target.spec.ts` · `frontend/e2e/support/touch-targets.ts` · `frontend/e2e/touch-targets.e2e.ts` · Modify `.claude/skills/riviera-tailwind/SKILL.md`

- [x] **Step 1: Write the failing test**

`frontend/src/app/shared/touch-target.spec.ts` (the shipped spec drives all three element kinds — `<button>`, `<a>`, `<input>` — via `it.each`):

```ts
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { TouchTarget } from './touch-target';

@Component({
  imports: [TouchTarget],
  template: `<button appTouchTarget class="rounded-[13px] px-4" data-testid="probe">Save</button>`,
})
class Host {}

describe('TouchTarget', () => {
  it('adds the 44px floor without dropping the consumer’s own classes', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    const probe = fixture.nativeElement.querySelector('[data-testid="probe"]') as HTMLElement;

    expect(probe.classList).toContain('min-h-11');
    expect(probe.classList).toContain('min-w-11');
    expect(probe.classList).toContain('rounded-[13px]');
    expect(probe.classList).toContain('px-4');
  });
});
```

`frontend/e2e/touch-targets.e2e.ts` (first surface only in this phase — the already-compliant
per-set editor, which must pass, plus the requests tab, which must **fail** until phase 1):

> **Superseded at execution (R-10).** The per-spec console mocks turned out not to be copies of one
> helper but ten tailored, stateful, differently-named mocks (`mockRequests`, `signInAndOpenPayouts`).
> Phase 0 therefore **adds** `support/operator-console.mocks.ts` — a read-only, breadth-first mock
> serving the sweep — and leaves every existing spec alone. The shipped shape is below.

```ts
import { expect, test } from '@playwright/test';

import { mockWholeConsole, signInToConsole } from './support/operator-console.mocks';
import { expectTouchTargets } from './support/touch-targets';

test.describe('44px touch targets at a phone width', () => {
  test.beforeEach(async ({ page }) => {
    await mockWholeConsole(page);
    await page.setViewportSize({ width: 390, height: 780 });
  });

  // Phase 1 brings the console shell to the floor and un-skips this; phase 0 only proves the sweep.
  test.fixme('operator console — requests tab', async ({ page }) => {
    await page.goto('/operator/1/requests');
    await signInToConsole(page);

    // A surface that rendered its empty state has no controls to measure and would sweep vacuously.
    await expect(page.getByTestId('request-card').first()).toBeVisible();

    await expectTouchTargets(page, 'operator requests tab');
  });
});
```

- [x] **Step 2: Run it, verify it fails** — both halves went red first:
  - `npx ng test --watch=false --include="src/app/shared/touch-target.spec.ts"` → FAIL, `Could not
    resolve "./touch-target"` (the directive did not exist yet).
  - `npx playwright test touch-targets --config=playwright.a11y.config.ts` → FAIL with **11**
    controls under 44 px, all in the console shell:
    `a[data-testid="oc-create-venue"] 87×20 | a[data-testid="oc-change-password"] 104×20 |
    button[data-testid="oc-signout"] 82×36 | a.oc-tab ×6 at 74–166 × 38 | a.underline 40×17 |
    a.underline 34×17`.
  - **Helper self-check** (temporarily `FLOOR = 999`, reverted): it measured **15** controls on that
    surface, so the eleven are a real result and not four silently-missed elements. The four it
    passed are the Requests tab's own accept/decline buttons at 161×64 and 89×64.

> Scope: this one spec file only. The full mocked suite runs at the end of the phase.

- [x] **Step 3: Minimal implementation**

`frontend/src/app/shared/touch-target.ts`:

```ts
import { Directive } from '@angular/core';

/**
 * The project's 44 × 44 CSS px touch-target floor (WCAG 2.5.5 Enhanced / iOS HIG), applied to a
 * native control: `<button appTouchTarget>`, `<a appTouchTarget>`, `<input appTouchTarget>`.
 *
 * <p>An attribute on the native element rather than a wrapper component — the shape Angular's
 * accessibility guide prescribes for a reusable control treatment, and the one `[appBusy]` and
 * `[appAmenityChip]` already use here. Both axes are set: a control tall enough but 20 px wide is
 * as unhittable as a short one.
 *
 * <p>**`min-height` does not apply to a non-replaced inline box.** On an `<a>` that is still
 * `display: inline`, this directive is a silent no-op — pair it with `inline-flex items-center`.
 * The proof is never the class list: `frontend/e2e/touch-targets.e2e.ts` measures the rendered box.
 *
 * <p>A control that is genuinely exempt — a link inside a sentence (WCAG 2.5.5's inline exception) —
 * carries `data-touch-exempt="<reason>"` instead, which the sweep skips and a reviewer can grep.
 */
@Directive({
  selector: '[appTouchTarget]',
  host: { class: 'min-h-11 min-w-11' },
})
export class TouchTarget {}
```

`frontend/e2e/support/touch-targets.ts`:

```ts
import { expect, type Page } from '@playwright/test';

const CONTROLS = 'button, input, select, textarea, a, [role="button"]';
const FLOOR = 44;

interface Measured {
  selector: string;
  width: number;
  height: number;
}

/**
 * Measures every visible interactive control on the current page and asserts the 44px floor.
 * Generic on purpose: a control added later is covered without touching this helper.
 */
export async function expectTouchTargets(page: Page, label: string): Promise<void> {
  const short = await page.evaluate(
    ({ controls, floor }) => {
      const describe = (el: Element): string => {
        const testid = el.getAttribute('data-testid');
        return testid ? `${el.tagName.toLowerCase()}[data-testid="${testid}"]` : el.tagName.toLowerCase();
      };

      return [...document.querySelectorAll(controls)]
        .filter((el) => !el.closest('[data-touch-exempt]'))
        .filter((el) => {
          const style = getComputedStyle(el);
          if (style.visibility === 'hidden' || style.display === 'none') return false;
          const box = el.getBoundingClientRect();
          return box.width > 0 && box.height > 0;
        })
        .map((el) => {
          const box = el.getBoundingClientRect();
          return { selector: describe(el), width: box.width, height: box.height };
        })
        .filter((m) => m.width < floor || m.height < floor);
    },
    { controls: CONTROLS, floor: FLOOR },
  );

  expect(
    short as Measured[],
    `${label}: controls under ${FLOOR}px — ${(short as Measured[])
      .map((m) => `${m.selector} ${Math.round(m.width)}×${Math.round(m.height)}`)
      .join(', ')}`,
  ).toEqual([]);
}
```

Then add the stated convention to `.claude/skills/riviera-tailwind/SKILL.md` — a new numbered rule
under **The rules**: the floor, `[appTouchTarget]`, the inline-box trap, the two exemption classes,
and that the proof is the e2e sweep, never the class list.

- [x] **Step 4: Run it, verify it passes** — `npx ng test --watch=false --include="src/app/shared/touch-target.spec.ts"` → **4 passed** (AC-3). `npm run lint` clean, `npm run format` applied. The console sweep is `test.fixme` pending phase 1, so the branch carries no red test; its RED evidence is step 2 above.

> `npm test -- touch-target` from the plan does **not** work: the script is `ng test`, which reads a bare argument as a *project* name (`Invalid values: Argument: project`). Filter with `--include=<path>`.

- [x] **Step 5: Generalization-audit pass**

Population `every element the app renders as an interactive control` → enumerate
`git ls-files 'frontend/src/app/**' | grep -v '\.spec\.ts$' | xargs grep -l '<button\|<input\|<select\|<textarea\|<a '` →
candidates: the ~40 files counted in the scope table → decision: swept phase by phase (1–4), with
phase 5 reconciling the file list against the routes the sweep actually visits. Append to the log.

- [x] **Step 6: Commit** — `git commit -m "Add the 44px touch-target floor as a directive and a measured sweep (#605)"`

- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Operator console: 5 tabs + create card + shell chrome

**Files:** Modify `frontend/src/app/operator/{operator-console,operator-chrome,payout-statement,payouts-tab,pricing-tab,venue-tab,venue-create-card}.{ts,html}` · `operator/operator-console.scss` · `frontend/src/app/app.html` · Test `frontend/e2e/touch-targets.e2e.ts` · `frontend/e2e/support/operator-console.mocks.ts`

- [x] **Step 1: Write the failing test** — a sweep per console route (requests, pricing, payouts,
      venue, `/operator?create=1`), each asserting a content marker first. `daily` and `beach-map`
      stay `test.fixme` for phase 2.
- [x] **Step 2: Run it, verify it fails** — 5 red. The shell's 11 recur on every tab; the per-tab
      additions were pricing 2, payouts 2, venue 22, create card 11 (incl. its own chrome).
- [x] **Step 3: Minimal implementation** — `[appTouchTarget]` on 30 Tailwind-styled controls across
      7 components; `min-height: 44px` + `display: inline-flex` on `.oc-tab` and `.oc-create-venue`
      in `operator-console.scss` (SCSS because those rules already live there — this is not an SCSS
      migration); `data-touch-exempt` on the two footer link blocks.
- [x] **Step 4: Run it, verify it passes** — 8 sweeps green; full mocked suite **184 passed, 2
      skipped**; unit suite **1380 passed**; lint clean; `npm run format` applied and the sweeps
      re-run after it (template whitespace can move an inline box).
- [x] **Step 5: Generalization-audit pass** — see the log's phase-1 row: the population is
      **controls behind a gated interaction state**, which a sweep of the resting surface
      structurally cannot see.
- [x] **Step 6: Commit**
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

### What phase 1 established

- **The shell was the whole story on four of five surfaces.** One SCSS file plus one template fixed
  11 of the 13–33 findings per tab, because the header and tab nav render on every console route.
- **Two defects were found in the *method*, not the code** — both recorded in the log below: the
  resting-surface blind spot, and the plan doc's own `dir/**` glob notation, which the
  file-structure guard silently ignores (it needs a trailing slash or an extension).

## Phase 2 — The two map grids (geometry + in-frame scroll)

**Files:** Modify `frontend/src/app/operator/daily-view-tab.html`, `daily-view-tab.ts` (`columns()`), `layout-editor.html` · `frontend/src/app/operator/operator-chrome.ts`, `requests-tab.{ts,html}`, `payouts-tab.html` (the two CI findings) · Test `frontend/e2e/operator-daily.e2e.ts`, `frontend/e2e/touch-targets.e2e.ts`, `frontend/e2e/support/touch-targets.ts`

- [x] **Step 1: Write the failing test** — AC-4 in `operator-daily.e2e.ts`: a 12-set row at 390 px,
      every tile ≥ 44 × 44, the grid scrolling inside its frame, the page not scrolling sideways,
      axe clean. Plus the two `test.fixme` sweeps un-skipped and the sweep mock widened to 12 sets
      per row (the old 6 fitted at 390 px and would have proved nothing).
- [x] **Step 2: Run it, verify it fails** — tiles measured **16 × 32**; the daily sweep reported 28
      controls under the floor.
- [x] **Step 3: Minimal implementation** — `minmax(0, 1fr)` → `minmax(44px, 1fr)` in both grids;
      the daily tile's fixed `h-8` → `min-h-11` and the editor cell's `h-7` → `min-h-11`; each grid
      wrapped in an `overflow-x-auto` scroller inside `app-beach-grid-frame`, keyboard-reachable
      (`tabindex="0"`, `role="group"`, an accessible name) per R-9. `flex-1` is kept and `w-max` is
      **not** used: a flex item's `min-width: auto` already refuses to shrink below the grid's
      min-content, so the row overflows into the scroller on a phone **and** still expands to fill
      on a desktop. Plus the daily view's own date/check-in controls.
- [x] **Step 4: Run it, verify it passes** — 19 phase-2 specs green; full mocked suite **187 passed,
      0 skipped**; unit **1380 passed** with **zero** spec files modified (AC-5).
- [x] **Step 5: Generalization-audit pass** — two rows in the log: the grid population, and the
      ambient-text-metrics population the CI findings exposed.
- [x] **Step 6: Commit**
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

### The two CI findings this phase absorbed

Phase 1 went green locally and **red on CI**, both failures caused by Linux text metrics being
taller than Windows'. They are in the findings register as F-1 and F-2; the durable lesson is that
**a control passing at 44 px by inherited line-height is one platform away from failing**, which is
why every control on a swept surface now carries the directive rather than relying on measurement.

## Phase 3 — Platform-admin console

**Files:** Modify `frontend/src/app/admin/` (8 components + the tab strip), `frontend/src/app/shared/confirm-with-reason.ts` · Test `frontend/e2e/touch-targets-admin.e2e.ts`, `frontend/e2e/support/admin-console.mocks.ts`

- [x] **Step 1: Write the failing test** — a new spec (`touch-targets-admin.e2e.ts`, split from the
      operator one because the two consoles need different mocks and sign-in) sweeping all seven
      admin routes, plus a second describe for the gated editor/confirm states.
- [x] **Step 2: Run it, verify it fails** — 7 red: the seven tab pills at ×40 on **every** surface,
      plus each page's own controls at ×39–41.
- [x] **Step 3: Minimal implementation** — the directive on the pills and on every control across 8
      admin components + `shared/confirm-with-reason.ts`. The tab strip's `mt-5`/`gap-2` were
      reduced for the F-2 reason, **proactively this time**.
- [x] **Step 4: Run it, verify it passes** — 20 sweeps green across both consoles; full mocked suite
      **197 passed, 0 skipped**; unit **1380 passed**; lint clean.
- [x] **Step 5: Generalization-audit pass** — the stale-measured-comment population; see the log.
- [x] **Step 6: Commit**
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

### The fold budget, paid for rather than gambled on

F-2 taught that a 44px pill grows whatever contains it. Seven pills × 3 wrapped rows put the admin
console's first heading back to **697** against a 740px fold — 43px of headroom, and Linux renders
taller than the Windows dev machine. Rather than push and see, the strip's own `mt-5` and row-gap
were cut (the 44px items now supply that rhythm), returning the heading to **685** — the exact
configuration CI had already proved green on phase 2. The whole page is *shorter* than before the
slice began: the old chrome alone cost 165px and now costs 133.

## Phase 4 — Auth, booking, tourist pages, shared primitives

**Files:** Modify `frontend/src/app/auth/**` (6), `booking/**` (5), `venue/**` (1), `pages/**` (1), `shared/**` (6) · Test `frontend/e2e/touch-targets.e2e.ts`

- [ ] **Step 1: Write the failing test** — sweep tests for `/account/sign-in`, the forgot/reset/verify/set-password pages, `/account/operator-password`, `/` (home + its two filter selects), a venue detail page, the booking view/confirmation, and the booking-pay page (which asserts the Stripe iframe is skipped, not measured).
- [ ] **Step 2: Run it, verify it fails** — → FAIL per surface.
- [ ] **Step 3: Minimal implementation** — apply the directive; exempt in-sentence links with a
      reason; leave `shared/confirm-panel.ts` alone where it already carries `min-h-11`, but add
      `min-w-11` for the width half. If `pages/home`'s selects change the hero's composition
      materially, stop and raise the open question rather than deciding it here.
- [ ] **Step 4: Run it, verify it passes** — full mocked suite + `npm test` + `npm run test:a11y`.
- [ ] **Step 5: Generalization-audit pass** — population `every third-party-rendered control the sweep cannot reach` → enumerate `git ls-files 'frontend/src/app/**' | xargs grep -ln 'iframe\|mountPaymentElement'` → decision recorded (documented exemption, not a fix).
- [ ] **Step 6: Commit** — `git commit -m "Bring the tourist, auth and booking surfaces to the 44px floor (#605)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 5 — Coverage reconciliation + close-out

**Files:** Modify `docs/plans/touch-target-floor.md`, `CLAUDE.md`, `.claude/skills/riviera-tailwind/SKILL.md` · Test `frontend/e2e/touch-targets.e2e.ts`

- [ ] **Step 1: Write the failing test** — reconcile: list every file that holds a control
      (the phase-0 command) against every route the sweep visits; any file whose controls no route
      exercises gets either a sweep test or an explicit line here saying why not.
- [ ] **Step 2: Run it, verify it fails** — the reconciliation names the gaps.
- [ ] **Step 3: Minimal implementation** — close the gaps (extra sweep tests or documented
      exclusions); record the floor as a project convention in `CLAUDE.md`; run
      `node scripts/check-plan-file-structure.mjs --diff origin/main`,
      `node scripts/check-inline-comments.mjs --diff origin/main`,
      `node scripts/check-focus-posture.mjs --diff origin/main`, and `npm run format`.
- [ ] **Step 4: Run it, verify it passes** — full mocked e2e + unit + lint + format + build.
- [ ] **Step 5: Generalization-audit pass** — population `every convention this repo states in a skill but does not machine-check` → enumerate by reading `riviera-tailwind`'s rules → decision: file the static-guard follow-up issue (Non-goal 1).
- [ ] **Step 6: Commit** — `git commit -m "Reconcile touch-target coverage and state the floor as a convention (#605)"`
- [ ] **Step 7: Update plan-doc execution status** — finalize for merge: stage pointer DONE, every phase ✅, Open Questions empty, `merged via PR #NN`.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated; a row whose population is "the other X like
> this one" is the shape that misses things (Step 5).

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-12 | plan — issue-intake grill | every element the app renders as an interactive control (**not** "the other operator tabs" — the issue's own population was `operator/*.html`, which structurally cannot see inline `template:` literals or SCSS) | `git ls-files 'frontend/src/app/<dir>/*' \| grep -v '\.spec\.ts$' \| xargs grep -ho '<button\|<input\|<select\|<textarea'` per feature dir | ~145 controls + ~56 anchors across ~40 files in 7 feature folders — vs the issue's 8 files | scope widened to the whole app (maintainer decision); swept in phases 1–4, reconciled in phase 5 |
| 2026-08-12 | phase 3 — the admin console | **every comment that states a measured pixel budget**, since this slice moves the bands those numbers describe and a stale measurement reads as fact. Enumerated by the numbers themselves, not by recalling which files discuss layout | `grep -rn "40px\|44px\|2\.5\.5" --include=*.ts --include=*.html --include=*.scss frontend/src \| grep -v spec` | 3 comments: `admin-console-tabs`'s "they are 40px, already under WCAG 2.5.5's 44px", and **two** in `admin-console-stats` — the per-band budget table and a second note claiming 22px of headroom | all three corrected against fresh measurements (chrome 0–133, h1 173–209, tabs 221–365, strip 385–626, heading 658–685). The second `admin-console-stats` note is the one resemblance would have missed: it is about *label wrapping*, not touch targets |
| 2026-08-12 | phase 2 — the tile floor | **every grid whose columns are sized by an unbounded `1fr`**, since such a column squeezes its control below the floor at a narrow width no matter what the control's own classes say | `grep -rn "grid-template-columns\|grid-cols-\|repeat(" src/app --include=*.html --include=*.ts --include=*.scss \| grep -v spec` | 20 grids; only the **two beach-map grids** size interactive tiles by `1fr`. The tourist `venue-map` already floors its tiles at `clamp(44px, 11vw, 56px)`; the rest are layout grids whose children are fields already tagged | both map grids moved to `minmax(44px, 1fr)` + in-frame scroll; the others need nothing, and the tourist map is evidence the floor was already the house style for a *map* |
| 2026-08-12 | phase 2 — CI findings F-1/F-2 | **every control that meets the floor only through ambient text metrics** (inherited line-height, flex `items-stretch`, text wrap) rather than an explicit rule — invisible locally because the dev machine is Windows and CI is Linux | per swept template, `grep -c "<button\|<input\|<select\|<textarea"` vs `grep -c "appTouchTarget"` | every swept template now balances except two deliberate cases: `venue-tab`'s `class="hidden"` file input (invisible; its visible proxy is the Add-photo button) and the exempt footer blocks. `statement-open` measured **exactly 44** — the definition of fragile | all tagged. The rule is now *tag the control*, never *measure and hope*; F-2 additionally proves a shared-chrome change must sweep **every** surface that renders it, not just the phase's own |
| 2026-08-12 | phase 1 — the first sweep of a surface with confirm/modal states | **controls behind a gated interaction state** — a sweep of the resting surface cannot see them, so a green sweep is not a covered surface. Enumerated by the branch that gates them, not by recalling which tabs have dialogs | `grep -rln "app-confirm-panel\|app-confirm-with-reason\|@if (.*[Cc]onfirm" src/app/operator src/app/admin --include=*.html --include=*.ts` | 5 gating components: `payouts-tab` (weather confirm + statement modal), `requests-tab` (decline confirm), `venue-tab` (photo Remove, gated on a slot being occupied), plus `layout-editor`/`set-editor` (phase 2) and the admin four (phase 3) | all four phase-1 states now have their own sweep test; the mock occupies one photo slot so the Remove button renders. Found 3 controls no resting sweep could reach (`weather-confirm-btn` 194×40, `weather-cancel-btn` 78×42, `statement-close` 62×34) |
| 2026-08-12 | phase 1 — file-structure guard reported 13 unlisted paths | **every path-token idiom the plan doc uses to stand in for a sweep**, since a token the guard cannot parse is indistinguishable from an omission — the section reads as covering the work while the guard counts nothing | read `scripts/check-plan-file-structure.mjs`'s `PATH_LIKE` / `DIR_LIKE` against the section's tokens | `frontend/src/app/operator/**` and 4 sibling `dir/**` tokens match neither pattern (`PATH_LIKE` needs an extension, `DIR_LIKE` a trailing slash) | all 5 rewritten as trailing-slash directories; the notation trap recorded in the section itself so phases 2–4 do not repeat it. `app.html` was a genuine omission and is now listed |
| 2026-08-12 | phase 0 — the vacuous-sweep defect (R-11) | every **mock payload field name the sweep depends on**, since a wrong name renders an empty surface and silences the sweep rather than failing it. Enumerated from the contract, not from the mock | read `src/app/operator/operator-console.model.ts` (`PendingRequestItem`, `ConsoleDailyBooking`, `PayoutLedgerEntryView`, `VenueProfileView`) against `e2e/support/operator-console.mocks.ts` | 3 wrong shapes: request (`id`/`expiresAt` → `bookingId`/`requestExpiresAt`), ledger entry (`occurredAt` → `createdAt`, missing `currency`), booking (invented `guestName`/`amount`/`setLabel`) | all three corrected against the contract; **and** the class defect fixed structurally — every surface test now asserts a content marker before sweeping, so an empty render fails instead of passing |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** Run `cd frontend && npm run test:e2e:a11y` → every `touch-targets.e2e.ts` test passes. Verified at commit `<sha>`.
- [ ] **AC-2:** Per phase, the red run in step 2 is recorded in Execution status with the failing selectors. Verified at commits `<sha per phase>`.
- [ ] **AC-3:** Run `cd frontend && npm test -- touch-target` → PASS. Verified at commit `<sha>`.
- [ ] **AC-4:** Run `cd frontend && npx playwright test operator-daily --config=playwright.a11y.config.ts` → PASS. Verified at commit `<sha>`.
- [ ] **AC-5:** Run `cd frontend && npm test -- daily-view-tab` → PASS with the spec file unmodified (`git diff --stat` shows no change to it). Verified at commit `<sha>`.
- [ ] **AC-6:** `riviera-tailwind` carries the stated rule; confirmed by the `riviera-docs-freshness` run at close-out. Verified at commit `<sha>`.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1). *(N/A — no backend in scope.)*
- [ ] **Availability** section filled (justified N/A); tap-to-mark parity pinned (AC-5).
- [ ] Pool + cutoff rules honored (invariants #3, #4). *(N/A — untouched.)*
- [ ] **Modulith** section filled (N/A — frontend-only).
- [ ] **Payment/payout** section filled (N/A — no money moves).
- [ ] Refund policy enforced server-side (invariant #10). *(N/A.)*
- [ ] Timezone correct (invariant #6). *(N/A.)*
- [ ] Booking codes unguessable (invariant #7). *(N/A.)*
- [ ] Flyway migration present for schema changes (invariant #12). *(N/A — no schema change, no `V<n>` claimed.)*
- [ ] **Frontend** standards met: standalone directive, `host` metadata, no `@HostBinding`, no `as any` in the sweep helper.
- [ ] Every changed control is proven by a *measured* assertion, not a class-list one.
- [ ] Every `data-touch-exempt` in the diff carries a reason string.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR**, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in `riviera-sdlc` `references/pr-gates.md` §1 *plus* `riviera-review-overlay`.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
