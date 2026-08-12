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
| Daily grid: row-label gutter (`w-5`) beside each row | preserved | unchanged; the gutter sits outside the scrolling `<ul>` so labels stay pinned while tiles scroll |
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
| R-5 | Taller controls push a surface's content down and break an existing layout/overflow assertion (e.g. the #600 "page does not scroll sideways" check, or a card that assumed its height) | med | med | run the full mocked e2e suite (`npm run test:e2e:a11y`) at the end of every phase, not just the phase's own spec; fix layout, never the assertion | implementer | open |
| R-6 | Prettier reformats the long class strings and the diff balloons past the real change | med | low | `npm run format` before each commit (whole-scope Prettier is a CI gate since #631); review the diff for reflow-only hunks and keep them in their own commit if large | implementer | open |
| R-7 | ~145 controls + ~56 anchors across ~40 files is a large mechanical diff; a missed file reads as "the sweep covered it" | med | med | the sweep is per **surface/route**, not per file — a missed control on a covered route fails. Routes not covered by a sweep test are listed explicitly in phase 5 | implementer | open |
| R-8 | Touching a control's `class` line pulls a neighbouring `[disabled]` into the focus-posture guard's judged region | low | low | it does not: `check-focus-posture.mjs:362` requires the `[disabled]` **line itself** to be diff-added. Verified by reading the script; re-verify by running `node scripts/check-focus-posture.mjs --diff origin/main` per phase | plan | open |
| R-10 | Promoting the duplicated `mockConsole`/`signIn` into `support/` touches seven shipped operator specs; a subtle divergence between the copies is flattened and a spec silently changes what it mocks | med | med | diff the copies before merging them; if they have genuinely diverged, promote the union with per-spec overrides rather than picking one. The specs' own assertions are the proof — all seven must stay green **unmodified** apart from the import line | implementer | open |
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

**Stage pointer:** `plan — complete, awaiting go-ahead to implement`

**Next action:** create branch `feature/touch-target-floor` off latest `origin/main`, commit this
plan doc, then start phase 0 (the directive + the sweep helper, red first).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — The floor: directive, sweep helper, stated convention | | |
| 1 — Operator console: 5 tabs + create card + shell chrome | | |
| 2 — The two map grids (geometry + in-frame scroll) | | |
| 3 — Platform-admin console | | |
| 4 — Auth, booking, tourist pages, shared primitives | | |
| 5 — Coverage reconciliation + close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

> Every path in the diff. The mechanical sweep is entered as globs per the guard's documented
> idioms; run `node scripts/check-plan-file-structure.mjs --diff origin/main` before pushing.

- `docs/plans/touch-target-floor.md` — this plan
- `frontend/src/app/shared/touch-target.ts` — the `[appTouchTarget]` directive
- `frontend/src/app/shared/touch-target.spec.ts` — its unit spec (AC-3)
- `frontend/e2e/support/touch-targets.ts` — `expectTouchTargets(page, label)`, the generic sweep
- `frontend/e2e/support/operator-console.mocks.ts` — `mockConsole`/`signIn`, promoted out of the
  operator specs that each hold a copy today
- `frontend/e2e/operator-{set-editing,console,daily,requests,payouts,pricing,venue}.e2e.ts` —
  re-pointed at the promoted mocks
- `frontend/e2e/touch-targets.e2e.ts` — one test per surface (AC-1)
- `frontend/src/app/operator/**` — every template and inline-template component with a control, plus
  `operator-console.scss` (the `.oc-tab` / `.oc-create-venue` / `.oc-signin-btn` rules)
- `frontend/src/app/admin/**` — every inline template with a control
- `frontend/src/app/auth/**`, `frontend/src/app/booking/**`, `frontend/src/app/venue/**`,
  `frontend/src/app/pages/**`, `frontend/src/app/shared/**` — same
- `frontend/e2e/operator-daily.e2e.ts` — the daily-grid geometry test (AC-4)
- `frontend/e2e/operator-console.e2e.ts` — the existing narrow-viewport test, extended with the nav
- `.claude/skills/riviera-tailwind/SKILL.md` — the stated convention (AC-6)
- `CLAUDE.md` — one line recording the floor as a project-wide convention (docs-freshness sweep)

---

## Phase 0 — The floor: directive, sweep helper, stated convention

**Files:** Create `frontend/src/app/shared/touch-target.ts` · `frontend/src/app/shared/touch-target.spec.ts` · `frontend/e2e/support/touch-targets.ts` · `frontend/e2e/touch-targets.e2e.ts` · Modify `.claude/skills/riviera-tailwind/SKILL.md`

- [ ] **Step 1: Write the failing test**

`frontend/src/app/shared/touch-target.spec.ts`:

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

> **The console mocks are not shared today.** `mockConsole`/`signIn` are duplicated as
> file-local functions in each operator spec (`operator-set-editing.e2e.ts:88,181` and siblings);
> `support/pages/operator-sign-in.page.ts` exports only the `OperatorSignInPage` page object. A
> sweep that visits every console route needs them once, so phase 0 promotes them to
> `frontend/e2e/support/operator-console.mocks.ts` and re-points the existing specs at it — a
> move, not a rewrite, and the specs' own assertions prove the move is faithful.

```ts
import { test } from '@playwright/test';

import { expectTouchTargets } from './support/touch-targets';
import { mockConsole, signIn } from './support/operator-console.mocks';

test.describe('44px touch targets at a phone width', () => {
  test.beforeEach(async ({ page }) => {
    await mockConsole(page);
    await page.setViewportSize({ width: 390, height: 780 });
  });

  test('operator console — requests tab', async ({ page }) => {
    await page.goto('/operator/1/requests');
    await signIn(page);
    await expectTouchTargets(page, 'operator requests tab');
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `cd frontend && npx playwright test touch-targets --config=playwright.a11y.config.ts` → FAIL, naming each short control (e.g. `button[data-testid="request-accept"] — 130×42`)

> Scope: this one spec file only. The full mocked suite runs at the end of the phase.

- [ ] **Step 3: Minimal implementation**

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

- [ ] **Step 4: Run it, verify it passes** — `cd frontend && npm test -- touch-target` → PASS. The e2e sweep stays RED on the requests tab; that is phase 1's job and is recorded as such in Execution status.

- [ ] **Step 5: Generalization-audit pass**

Population `every element the app renders as an interactive control` → enumerate
`git ls-files 'frontend/src/app/**' | grep -v '\.spec\.ts$' | xargs grep -l '<button\|<input\|<select\|<textarea\|<a '` →
candidates: the ~40 files counted in the scope table → decision: swept phase by phase (1–4), with
phase 5 reconciling the file list against the routes the sweep actually visits. Append to the log.

- [ ] **Step 6: Commit** — `git commit -m "Add the 44px touch-target floor as a directive and a measured sweep (#605)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Operator console: 5 tabs + create card + shell chrome

**Files:** Modify `frontend/src/app/operator/{daily-view-tab,requests-tab,payouts-tab,pricing-tab,venue-tab,venue-create-card,operator-console}.html` · `operator/operator-console.scss` · `operator/{operator-chrome,operator-home,payout-statement,stale-write-banner,scan-input,camera-qr-scanner}.ts` · Test `frontend/e2e/touch-targets.e2e.ts`

- [ ] **Step 1: Write the failing test** — extend `touch-targets.e2e.ts` with one test per console
      route: `/operator/1/daily`, `/operator/1/requests`, `/operator/1/payouts`, `/operator/1/pricing`,
      `/operator/1/venue`, `/operator` (home + create card). Each calls `expectTouchTargets`.
      The daily route is expected to stay red until phase 2 — mark it `test.fixme` with a comment
      naming phase 2, and remove the marker there.
- [ ] **Step 2: Run it, verify it fails** — `npx playwright test touch-targets --config=playwright.a11y.config.ts` → FAIL on each route with the offending selectors listed.
- [ ] **Step 3: Minimal implementation** — apply `[appTouchTarget]` (importing `TouchTarget` in each
      component's `imports`) to every control the sweep named; where the element is an inline `<a>`
      (`.oc-create-venue`, the tab pills) add `inline-flex items-center` alongside. In
      `operator-console.scss`, give `.oc-tab`, `.oc-create-venue` and `.oc-signin-btn` a
      `min-height: 44px` + `display: inline-flex; align-items: center` — SCSS, not Tailwind, because
      those rules already live there and this slice is not an SCSS migration. Mark the footer
      `Privacy`/`Terms` links `data-touch-exempt="inline prose link (WCAG 2.5.5 inline exception)"`.
- [ ] **Step 4: Run it, verify it passes** — the six routes green; then `npm run test:e2e:a11y` in full (R-5) and `npm test` for the console unit specs.
- [ ] **Step 5: Generalization-audit pass** — population `every operator control the sweep did not visit because its route/state was not rendered` (modals, error states, the QR scanner's camera branch) → enumerate by opening each state in the sweep spec → decision recorded.
- [ ] **Step 6: Commit** — `git commit -m "Bring the operator console's controls to the 44px floor (#605)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — The two map grids (geometry + in-frame scroll)

**Files:** Modify `frontend/src/app/operator/daily-view-tab.html`, `daily-view-tab.ts:293` (`columns()`), `layout-editor.html:162` · Test `frontend/e2e/operator-daily.e2e.ts`, `frontend/e2e/touch-targets.e2e.ts`

> This is the phase the issue called "mechanical" and is not. Read the parity ledger's grid rows
> before starting.

- [ ] **Step 1: Write the failing test** — in `operator-daily.e2e.ts`, a 390 px test over a mock
      venue whose widest row has 12 sets: every `[data-testid="daily-tile"] button` is ≥ 44 × 44;
      the grid frame's scroller has `scrollWidth > clientWidth`; `document.documentElement` does
      **not** overflow horizontally; axe clean. Remove the `test.fixme` from the daily route in
      `touch-targets.e2e.ts`.
- [ ] **Step 2: Run it, verify it fails** — → FAIL: tiles measure ~26×32 at that width.
- [ ] **Step 3: Minimal implementation** — `columns()` returns `repeat(${row.sets.length}, minmax(44px, 1fr))`; the tile button's `h-8` becomes `min-h-11` (width comes from the column); the rows' shared parent gains `overflow-x-auto` inside `app-beach-grid-frame`, with the row-label gutter kept outside the scroller. Give the scroller `tabindex="0"` and an accessible name (R-9). Apply the same `minmax(44px, 1fr)` + in-frame scroll to `layout-editor.html:162`.
- [ ] **Step 4: Run it, verify it passes** — `npx playwright test operator-daily touch-targets --config=playwright.a11y.config.ts`, then `npm test -- daily-view-tab layout-editor` (AC-5: unmodified unit specs stay green), then the full mocked suite.
- [ ] **Step 5: Generalization-audit pass** — population `every grid in the app whose columns are sized by 1fr and can therefore squeeze below the floor` → enumerate `git ls-files 'frontend/src/app/**' | xargs grep -n 'grid-template-columns\|grid-cols-'` → judge each (the tourist `venue-map` already uses `clamp(44px, 11vw, 56px)` and passes) → decision recorded.
- [ ] **Step 6: Commit** — `git commit -m "Give both beach-map grids a 44px tile floor that scrolls in-frame (#605)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — Platform-admin console

**Files:** Modify `frontend/src/app/admin/**` (8 files with controls, incl. `admin-console-tabs.ts` — whose comment already admits its 40 px tabs are under the figure) · Test `frontend/e2e/touch-targets.e2e.ts`

- [ ] **Step 1: Write the failing test** — one sweep test per admin route (operators, venue photos, audit, mail outbox, commissions, privacy).
- [ ] **Step 2: Run it, verify it fails** — → FAIL, including the 40 px tab pills the code comment predicted.
- [ ] **Step 3: Minimal implementation** — `[appTouchTarget]` + `inline-flex items-center` on the tab pills; delete the now-false comment at `admin-console-tabs.ts:46` and replace it with nothing (the code no longer needs an apology).
- [ ] **Step 4: Run it, verify it passes** — the admin routes green; full mocked suite.
- [ ] **Step 5: Generalization-audit pass** — population `every code comment in the repo that documents a known sub-44px control` → enumerate `git ls-files | xargs grep -n '44px\|2.5.5'` → decision recorded (a stale apology left behind is a doc-freshness bug).
- [ ] **Step 6: Commit** — `git commit -m "Bring the platform-admin console to the 44px floor (#605)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

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
