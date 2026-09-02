# Focus-ring baseline: one answer for every button's focus indicator

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Every `<button>` in the tree shows the project's 3px token focus ring on
`:focus-visible` — the 85 that relied on the user-agent default included — from ONE rule, with
a guard that fails the build if any control ever suppresses its outline, and a rendered proof
that the rule paints and that the per-site `outline-white` overrides still win.

**Architecture:** The single most significant decision is the **seam**: a `button:focus-visible`
rule inside `@layer base` in `src/tailwind.css`, not a utility string on `TouchTarget` and not
85 hand edits. Tailwind v4 emits `@layer theme, base, components, utilities;` and documents
`@layer base` as the way to "add your own base styles on top of Preflight" for native elements
([adding-custom-styles](https://tailwindcss.com/docs/adding-custom-styles#adding-base-styles),
[preflight](https://tailwindcss.com/docs/preflight#extending-preflight)); every existing
`focus-visible:outline-white` / `-offset-1` / `-outline-offset-[3px]` utility lives in the later
`utilities` layer and therefore overrides the baseline deterministically — the same override
put on a directive's host class would be a same-layer stylesheet-order coin flip
(`riviera-tailwind` rule 3). Preflight itself sets no outline on `button` (its only focus rule is
`:-moz-focusring:where(:not(iframe)) { outline: auto }`), which is exactly why the UA default has
been load-bearing. Angular's emulated encapsulation lets "global styles defined outside of a
component … affect elements inside" it
([styling](https://angular.dev/guide/components/styling#viewencapsulationemulated)), so the rule
reaches every component's buttons without a per-component hook. The rule MUST sit inside
`@layer base`: the stylesheet's existing `html, body` rules are un-layered, and an un-layered
focus rule would beat every utility — the wrong way round.

**Persistence:** N/A — frontend-only, no backend code and no schema change (invariants #1,
#12 untouched).

**Source of intent:** GitHub issue #890, surfaced by #887 (PR #889) and its plan
`docs/plans/console-btn-hover-token.md` (Non-goals: "Adding a `focus-visible` ring to the
sign-out button").

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — enumerated the
26/85 population itself, checked in-flight PRs: none open, no Flyway in scope; surfaced the
clipped-ring case in `photo-gallery-grid`) · `riviera-plan-doc` (this template — forced the
behavior-parity ledger, which is what made "the UA default is replaced, explicit rings are
preserved" a checked claim rather than a hope) · `tdd` (each phase red-first: the guard spec
before the rule, the gallery spec before the tile edit, the e2e written before the run) ·
`riviera-review-overlay` (review gate — **ran** at ready-for-review via `Skill("code-review:code-review")`, 5 reviewers + scoring; 3 findings, F-1..F-3, all fixed) ·
`riviera-docs-freshness` (**ran** over `origin/main...HEAD` at ready-for-review — 1 finding, historical: `console-btn-hover-token.md`'s Non-goals note describes the gap as it stood at #887; left as a record) ·
`grilling` (the intake round: verdict / seam / population / tiles — answers recorded under
Open questions › Resolved) · `riviera-local-debug` (cloud-session recipes: scoped Vitest runs,
`PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium` for the mocked e2e) · `riviera-frontend`
(the new spec + e2e land in `shared/` and the mocked `frontend/e2e/` suite; `testing/` for the
stylesheet helper) · `riviera-tailwind` (rule 1: no `@apply`/`@utility` — a base-layer element
rule is Preflight extension, not a mixin; rule 3: why the seam is a cascade layer and not a
directive host class; the no-drift proof shape: declaration guard reads `tailwind.css` as text,
the cascade proof is a mocked e2e) · `angular-developer` + angular-cli MCP (`get_best_practices`
v22 — a11y floor; `search_documentation` for the a11y guide, which covers focus management and
not indicator styling, and the styling guide's global-styles clause quoted above) ·
`playwright-cli` (the e2e authoring conventions; measured `toHaveCSS`, never class lists) ·
Tailwind v4 docs (`adding-custom-styles`, `preflight`, `outline-style` — `outline-hidden` vs
`outline-none`, both of which the guard rejects on a control).

**Branch:** `claude/sdlc-890-miiv39` — the session's designated remote branch stands in for
`feature/focus-ring-baseline` (`riviera-sdlc` remote addendum).

---

## Acceptance criteria (testable)

- [x] **AC-1 (the named answer):** Given the compiled stylesheet, when `src/tailwind.css` is read as
      text, then it declares exactly one `button:focus-visible` rule, inside `@layer base`, painting
      `outline: 3px solid var(--riv-accent-ink)` with `outline-offset: 2px`. *Seam:* `src/tailwind.css`
      read through `testing/stylesheet-tokens.ts` (`baseLayerBlock()`) · *Pinned by:*
      `focus-ring-baseline.spec.ts` › "declares the baseline ring once, inside @layer base".
- [x] **AC-2 (one ring width tree-wide):** Given every source under `src/app`, when the
      `focus-visible:outline-[<n>px]` utilities are enumerated, then every one is `3px` — the base
      rule and the explicit sites agree. *Seam:* the `src/app` source tree · *Pinned by:*
      `focus-ring-baseline.spec.ts` › "every explicit ring is the same 3px the baseline paints".
- [x] **AC-3 (the guard):** Given every `.ts`/`.html` under `src/app`, when a source suppresses an
      outline (`outline-none`, `outline-hidden`, `outline-0`, `outline: none`) on a control
      (`button`, `a`, `input`, `select`, `textarea`, `summary`), then the spec fails naming the path;
      the two programmatically-focused `<h1>`s in `operator-home.ts` stay legal because a heading is
      not a control. *Seam:* the `src/app` source tree · *Pinned by:* `focus-ring-baseline.spec.ts`
      › "no control suppresses its outline — the baseline is the only indicator half the tree has".
- [x] **AC-4 (clipped tiles):** Given the gallery grid's three tile buttons inside their
      `overflow-hidden rounded-[26px]` host, when rendered, then each carries the inset white ring
      utilities (`focus-visible:-outline-offset-[3px] focus-visible:outline-white`) so the ring paints
      inside the clip. *Seam:* `PhotoGalleryGrid`'s rendered template · *Pinned by:*
      `photo-gallery-grid.spec.ts` › "paints its focus ring inside the clipped tile, in white over the photo".
- [x] **AC-5 (rendered proof, migrated control):** Given the operator console with the sign-out
      button (`oc-signout`, the issue's origin, carrying no `focus-visible:` utility), when it is
      focused, then Chromium computes `outline-width: 3px`, `outline-style: solid`,
      `outline-color: rgb(8, 90, 110)`, `outline-offset: 2px`, and before focus `outline-style: none`.
      *Seam:* the mocked console route `/operator/1/beach-map` · *Pinned by:*
      `e2e/focus-ring-baseline.e2e.ts` › "a button with no focus utility paints the baseline ring (#890)".
- [x] **AC-6 (rendered proof, override still wins):** Given the photo lightbox's close button
      (`focus-visible:outline-white`, fixed-dark host), when focused, then `outline-color` is
      `rgb(255, 255, 255)` and `outline-width` `3px` — the utilities layer beats the baseline.
      *Seam:* `/venues/1` with the mocked 3-photo venue · *Pinned by:*
      `e2e/focus-ring-baseline.e2e.ts` › "a site that names its own ring colour still wins — the utilities layer beats base (#890)".
- [x] **AC-7 (rendered proof, inset tile):** Given `gallery-photo-0`, when focused, then
      `outline-offset: -3px` and `outline-color: rgb(255, 255, 255)`. *Seam:* `/venues/1` as above ·
      *Pinned by:* `e2e/focus-ring-baseline.e2e.ts` › "the clipped gallery tile paints its ring inset, in white over the photo (#890)".
- [x] **AC-9 (fixed-light host):** Given the sign-out warning bar — fixed white with `#b3261e` ink in
      every theme — when its two buttons are focused under the dark theme, then the ring is the bar's own
      ink (`outline-current`), not the themed `#7cd7e8` that would sit under 2:1 on white. *Seam:* `app.html`
      read as text + the tourist shell at `/` under `data-riv-theme="dark"` · *Pinned by:*
      `focus-ring-baseline.spec.ts` › "the buttons on the fixed-white sign-out bar pin the ring to their own
      ink, which clears 3:1" and `e2e/focus-ring-baseline.e2e.ts` › "the fixed-white sign-out bar keeps a
      3:1 ring in the dark theme (#890)".
- [x] **AC-8 (docs settled):** `docs/design/non-text-contrast.md` no longer calls the sign-out
      button's focus indicator "today an unstyled one"; it names the baseline and this issue.
      *Seam:* the doc text · *Pinned by:* `focus-ring-baseline.spec.ts` › "the design doc no longer
      records the indicator as unstyled" (a text sweep, the `#834` precedent).

## Non-goals

- **Inputs, selects, textareas, links, `summary`.** The issue's population is `<button>`; the
  maintainer chose buttons-only at the intake round. Widening is a one-line selector change
  recorded as a follow-up under Open questions › Resolved.
- **Retuning the ring colour.** `--riv-accent-ink` IS the colour 36 explicit sites already use on
  light hosts; no new `--riv-focus-*` token. The fixed-dark sites keep their own `outline-white`.
- **The four `focus-visible:outline-[#0a3f4e]` literals in `venue/day-availability.ts`.** Colour-
  literal residue in the #836 ledger's sense; this slice adds the ledger ROW the issue asked
  for and changes no pixel there.
- **Touching the 60 explicit ring declarations.** They stay; the baseline makes them redundant
  where they match, and a later slice may prune them — not this one (no-drift: nothing moves).
- **`ViewEncapsulation.ShadowDom` components.** None exist (`grep -rn "ShadowDom" frontend/src`
  → 0); the global rule reaches everything.

## Behavior-parity ledger (retirement / replacement slices only)

The slice replaces the user-agent focus indicator on 85 buttons; every other focus behaviour
must be shown preserved.

| Old-surface behavior | Verdict (preserved / changed / dropped) | How the new surface does it, or why it's gone |
|---|---|---|
| A button with no `focus-visible:` utility shows Chromium's `outline: auto 1px -webkit-focus-ring-color` on keyboard focus | **changed** | shows the 3px `--riv-accent-ink` ring, offset 2px, from the `@layer base` rule — AC-5 measures it |
| A button with `focus-visible:outline-[3px] … outline-riv-accent-ink` shows that ring | preserved | utilities layer restates the same values over the baseline; no pixel moves |
| A fixed-dark-host button with `focus-visible:outline-white` shows a white ring | preserved | utilities layer beats base — AC-6 measures the lightbox close button |
| Beach tiles' inset ring (`-outline-offset-[3px]`, `outline-riv-tile-focus`) | preserved | same layer argument; offset and colour both utility-owned |
| `booking-dialog` inputs' `outline-offset-1` ring | preserved | inputs are outside the selector entirely (buttons-only) |
| Programmatically-focused `<h1>`s in `operator-home.ts` show no ring (`outline-none`) | preserved | `h1` is outside the selector; the guard lists headings as non-controls |
| Gallery tiles: UA ring, clipped invisible by the grid's `overflow-hidden` | **changed** | inset white ring at the primitive — AC-4/AC-7 |
| Mouse click on a button shows no ring (`:focus-visible` heuristics) | preserved | the rule is `:focus-visible`, not `:focus` |
| Forced-colors mode repaints the ring in system colours | preserved | `outline` with `forced-color-adjust: auto`; `cta-border-token.contrast.spec.ts` guards no opt-out |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The rule lands un-layered (next to `html, body`) and beats every per-site `outline-white`, turning fixed-dark rings teal | med | high | AC-1 asserts the rule is INSIDE `@layer base`; AC-6 measures the override winning in a real render | this slice | closed — AC-1 + AC-6 green at `0e65126` |
| R-2 | A button inside an `overflow-hidden` ancestor gets a clipped, invisible ring (the gallery grid case, and any future one) | med | med | gallery tiles get the inset ring at the primitive (AC-4/AC-7); other clipped hosts are enumerated in the generalization audit and judged | this slice | closed — audit row 1; AC-4/AC-7 green |
| R-3 | A future slice writes `outline-none`/`outline-hidden` on a control to silence the ring for visual reasons, removing the only indicator | med | high | AC-3's sweep fails the build naming the path; the tailwind skill's Red flags list gains the item | this slice | closed — AC-3 green; rule 6 + red flag landed at `be19839` |
| R-4 | `:focus-visible` after programmatic `.focus()` does not match in the e2e, making AC-5 flaky | **hit** | med | It did not match on the console: signing in clicks, and Chromium treats script focus after a pointer interaction as pointer-driven. The test steps off the button and back with `Tab` / `Shift+Tab`, which always matches; the two tourist tests keep the plain-navigation `.focus()` posture. Resting state pinned first in all three | this slice | closed — Phase 1 |
| R-5 | The base rule's 2px offset ring on a button sitting flush against a card edge overlaps neighbours | low | low | visual only; the 60 explicit sites already use offset-2 on the same hosts | this slice | accepted |
| R-6 | Two Playwright workers + a new spec file push the mocked suite over CI's budget | low | low | one short file, four tests; the suite is ~5 min at 2 workers | this slice | accepted |
| R-7 | A button on a host that does NOT follow the theme gets the themed ring: on a fixed-white host the dark theme's `#7cd7e8` accent ink sits under 2:1 | **hit** (review F-1) | high | The sign-out bar's two buttons pin the ring to their own fixed ink with `focus-visible:outline-current` (AC-9, unit + dark-theme e2e). Population swept by mechanism — see the audit log | this slice | closed — review fix |

## Open questions / Assumptions

### Resolved

- **Verdict (Q1):** adopt the token ring — maintainer, intake round 2026-09-02.
- **Seam (Q2):** maintainer asked for the Tailwind and Angular documentation to be consulted
  before settling; the findings (Architecture above) support the `@layer base` rule and
  reject the directive host class. Adopted.
- **Population (Q3):** buttons only — maintainer, intake round. Follow-up recorded here rather
  than as an issue: widening to `input, select, textarea, a[href], summary` is one selector
  change in `tailwind.css` plus widening AC-3's control list; the guard already treats those tags
  as controls.
- **Gallery tiles (Q4):** inset white ring at the primitive — maintainer, intake round.
- **Assumption:** Chromium's `:focus-visible` matches after script `.focus()` on a button when
  no pointer interaction preceded it — verified at Phase 1's green run for the two tourist tests;
  refuted for the console test, where the sign-in click precedes it (R-4, keyboard step added).

## Availability & concurrency (invariant #2)

N/A — does not affect availability: a stylesheet rule and a component class string; no booking,
map-data or `availability` write path is touched.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

### Module ownership (§4a)

N/A — no backend behavior added or moved.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `src/tailwind.css` | existing | global stylesheet (`@layer base` rule) | — | — |
| FE-2 | `shared/photo-gallery-grid.ts` | existing | standalone component (class string only) | signals (unchanged) | — |
| FE-3 | `shared/focus-ring-baseline.spec.ts` | new | Vitest guard (stylesheet + source sweep) | — | — |
| FE-4 | `testing/stylesheet-tokens.ts` | existing | test helper (`baseLayerBlock()`) | — | — |
| FE-5 | `e2e/focus-ring-baseline.e2e.ts` | new | mocked Playwright spec | — | — |

**Standards:** no component API changes; the gallery grid keeps `input()`/`output()`; no
`as any`. Deviation: none.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** `DONE — merged via PR #895` (close-out written pre-merge, in the PR's last commit)

**Next action:** none in the repo — merge PR #895 once its final head is green; the remaining close-out items (issue closed by `Closes #890`, subscription ended) are GitHub-side.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — guard spec + `@layer base` rule | ✅ | `df74334` |
| 1 — gallery inset ring + mocked e2e | ✅ | `0e65126` |
| 2 — docs: design note, ledger row, skill rule, CLAUDE.md bullet | ✅ | `be19839` |
| 3 — merge main, ready-for-review, review + Sonar gates | ✅ | `origin/main` had not moved at ready-for-review (`git log HEAD..origin/main` empty); review fixes `84b5874a`; this close-out commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (history reviewer) | The themed baseline ring on the fixed-white sign-out bar resolves `#7cd7e8` on white in dark (~1.65:1) — a 2.4.11/1.4.11 regression on the tourist shell (the consoles are porcelain-pinned, so the e2e never saw it) | fixed — `focus-visible:outline-current` on both bar buttons; AC-9 unit + dark-theme e2e; R-7 |
| F-2 | review (prior-PR reviewer) | The cascade-layer rationale restated in three places, and the `tailwind.css` comment missing the `Rationale:` pointer the file's token comments carry (#862/#871/#875/#878/#883/#885/#886 precedent) — the maintainer raised the same point on the skill + CLAUDE.md prose | fixed — one full explanation in `tailwind.css` (+ pointer); skill rule 6 and the CLAUDE.md bullet cut to the contract; `baseLayerBlock()` doc to its contract |
| F-3 | review (prior-PR reviewer) | Three `Pinned by` citations paraphrased the e2e titles (#871/#875/#877 precedent) | fixed — verbatim |
| F-4 | sonar | Analysis at `be19839`: 0 new issues, 0 security hotspots, 0 duplicated blocks, 82.4% new-code coverage (38 new lines) — list pulled from the API, not just the gate badge; the final head's re-analysis is read off the PR's SonarCloud check before merge | clean |

---

## File structure

- `docs/plans/focus-ring-baseline.md` — this plan.
- `frontend/src/tailwind.css` — the `@layer base` `button:focus-visible` rule + its rationale comment.
- `frontend/src/app/app.html` — the sign-out bar's two buttons pin the ring to their own ink (`outline-current`).
- `frontend/src/testing/stylesheet-tokens.ts` — `baseLayerBlock()`: the `@layer base { … }` block as text.
- `frontend/src/app/shared/focus-ring-baseline.spec.ts` — AC-1/2/3/8 guards.
- `frontend/src/app/shared/photo-gallery-grid.ts` — inset white ring utilities on the three tiles.
- `frontend/src/app/shared/photo-gallery-grid.spec.ts` — AC-4 declaration check.
- `frontend/e2e/focus-ring-baseline.e2e.ts` — AC-5/6/7 rendered proofs (mocked suite).
- `docs/design/non-text-contrast.md` — the sign-out focus note settled (AC-8).
- `docs/design/colour-literal-token-audit.md` — the `outline-[#0a3f4e]` ×4 row the issue asked for.
- `.claude/skills/riviera-tailwind/SKILL.md` — the focus-baseline rule + red flag.
- `frontend/.claude/CLAUDE.md` — a11y bullet naming the baseline and the guard.

---

## Phase 0 — Guard spec + the `@layer base` rule

**Files:** Create `frontend/src/app/shared/focus-ring-baseline.spec.ts` · Modify
`frontend/src/testing/stylesheet-tokens.ts` · Modify `frontend/src/tailwind.css`

- [ ] **Step 1: Write the failing test** — the spec below (AC-1, AC-2, AC-3, AC-8); AC-8's
      sweep is expected red until Phase 2 and is marked so in the phase table.

```ts
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { STYLESHEET, baseLayerBlock } from '../../testing/stylesheet-tokens';

const APP_ROOT = join(process.cwd(), 'src/app');
const SELF = 'shared/focus-ring-baseline.spec.ts';
const CONTROL_TAGS = new Set(['button', 'a', 'input', 'select', 'textarea', 'summary']);
const SUPPRESSION = /outline-none|outline-hidden|outline-0\b|outline:\s*none/g;

function allSources(): readonly string[] {
  return readdirSync(APP_ROOT, { recursive: true, encoding: 'utf8' })
    .map((path) => path.replaceAll('\\', '/'))
    .filter((path) => /\.(ts|html)$/.test(path) && path !== SELF);
}

function enclosingTag(text: string, index: number): string | undefined {
  const open = text.lastIndexOf('<', index);
  if (open === -1 || text.lastIndexOf('>', index) > open) return undefined;
  return /^<([a-zA-Z][\w-]*)/.exec(text.slice(open))?.[1]?.toLowerCase();
}

describe('the focus-ring baseline (#890)', () => {
  it('declares the baseline ring once, inside @layer base', () => {
    const base = baseLayerBlock();
    expect(base).toMatch(/button:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--riv-accent-ink\);/);
    expect(base).toMatch(/button:focus-visible\s*\{[^}]*outline-offset:\s*2px;/);
    expect(STYLESHEET.match(/button:focus-visible/g)).toHaveLength(1);
  });

  it('every explicit ring is the same 3px the baseline paints', () => {
    const widths = allSources().flatMap((path) =>
      [...readFileSync(join(APP_ROOT, path), 'utf8').matchAll(/focus-visible:outline-\[(\d+)px\]/g)]
        .map((m) => `${path}: ${m[1]}px`),
    );
    expect(widths.length).toBeGreaterThan(0);
    expect(widths.filter((w) => !w.endsWith(': 3px'))).toEqual([]);
  });

  it('no control suppresses its outline — the baseline is the only indicator half the tree has', () => {
    const offenders = allSources().flatMap((path) => {
      const text = readFileSync(join(APP_ROOT, path), 'utf8');
      return [...text.matchAll(SUPPRESSION)]
        .map((m) => ({ tag: enclosingTag(text, m.index), token: m[0] }))
        .filter(({ tag }) => tag === undefined || CONTROL_TAGS.has(tag))
        .map(({ tag, token }) => `${path}: ${token} on <${tag ?? 'no element'}>`);
    });
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `cd frontend && npx vitest run src/app/shared/focus-ring-baseline.spec.ts`
      → FAIL: `baseLayerBlock` does not exist / no `@layer base` in the stylesheet.

- [ ] **Step 3: Minimal implementation** — `baseLayerBlock()` in `testing/stylesheet-tokens.ts`
      (brace-counted `@layer base {` slice, throwing if absent), and in `tailwind.css`, after the
      theme blocks and before the un-layered `html, body`:

```css
/** The focus-indicator baseline (#890). Preflight resets no outline, so a button without a
    `focus-visible:` utility showed the user-agent ring — half the tree, with nothing recording
    that as intended. This rule makes the project's 3px ring the default for every `<button>`.
    It MUST live in `@layer base`: utilities sit in a later layer, so a site's own
    `focus-visible:outline-white` (fixed-dark hosts) or `-outline-offset-[3px]` (clipped tiles)
    keeps winning deterministically; un-layered, it would beat them all. Guard:
    app/shared/focus-ring-baseline.spec.ts; render proof: e2e/focus-ring-baseline.e2e.ts. */
@layer base {
  button:focus-visible {
    outline: 3px solid var(--riv-accent-ink);
    outline-offset: 2px;
  }
}
```

- [ ] **Step 4: Run it, verify it passes** — same command → PASS (3/3).
      End-of-phase regression: `npx vitest run src/app/shared src/testing` (the `shared/` guards that
      read `tailwind.css` as text, so a structural change to the stylesheet is caught here).

- [ ] **Step 5: Generalization-audit pass** — Population "buttons whose ring is clipped by an
      `overflow-hidden` ancestor" → enumerate `grep -rn "overflow-hidden" frontend/src/app --include=*.ts --include=*.html`
      and, for each hit, whether a `<button>` without an inset ring sits inside → record.

- [ ] **Step 6: Commit** — `git commit -m "Paint the 3px focus ring on every button from one @layer base rule (#890)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Gallery inset ring + the rendered proof

**Files:** Modify `frontend/src/app/shared/photo-gallery-grid.ts` · Modify
`frontend/src/app/shared/photo-gallery-grid.spec.ts` · Create `frontend/e2e/focus-ring-baseline.e2e.ts`

- [ ] **Step 1: Write the failing tests** — in `photo-gallery-grid.spec.ts`:

```ts
  it('paints its focus ring inside the clipped tile, in white over the photo', () => {
    create(['/a', '/b', '/c']);
    for (const index of [0, 1, 2]) {
      const tile = el().querySelector(`[data-testid="gallery-photo-${index}"]`)!;
      expect(tile.classList.contains('focus-visible:-outline-offset-[3px]'), `tile ${index}`).toBe(true);
      expect(tile.classList.contains('focus-visible:outline-white'), `tile ${index}`).toBe(true);
    }
  });
```

and the e2e (mocked suite; fixtures mirror `discover-photos.e2e.ts`, console mocks from
`support/operator-console.mocks`):

```ts
test('a button with no focus utility paints the baseline ring (#890)', async ({ page }) => {
  await mockWholeConsole(page);
  await page.goto('/operator/1/beach-map');
  await signInAsOperator(page);
  const signOut = page.getByTestId('oc-signout');
  await expect(signOut).toHaveCSS('outline-style', 'none');
  await signOut.focus();
  await expect(signOut).toHaveCSS('outline-style', 'solid');
  await expect(signOut).toHaveCSS('outline-width', '3px');
  await expect(signOut).toHaveCSS('outline-color', 'rgb(8, 90, 110)');
  await expect(signOut).toHaveCSS('outline-offset', '2px');
});
```

plus the lightbox-close (`outline-color` white) and `gallery-photo-0` (`outline-offset` `-3px`,
white) tests on `/venues/1`.

- [ ] **Step 2: Run, verify red** — `npx vitest run src/app/shared/photo-gallery-grid.spec.ts` → FAIL
      (class missing); `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test -c playwright.a11y.config.ts e2e/focus-ring-baseline.e2e.ts`
      → the tile test FAILS on offset (the baseline paints `2px`).

- [ ] **Step 3: Minimal implementation** — append `focus-visible:-outline-offset-[3px] focus-visible:outline-white`
      to each of the three tile `class` strings in `photo-gallery-grid.ts`.

- [ ] **Step 4: Run, verify green** — both commands → PASS.

- [ ] **Step 5: Generalization-audit pass** — the Phase 0 population's decision applied here.

- [ ] **Step 6: Commit** — `git commit -m "Paint the gallery tiles' focus ring inset and prove the baseline renders (#890)"`

- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 2 — Docs

**Files:** Modify `docs/design/non-text-contrast.md` · Modify `docs/design/colour-literal-token-audit.md`
· Modify `.claude/skills/riviera-tailwind/SKILL.md` · Modify `frontend/.claude/CLAUDE.md`

- [ ] **Step 1:** add the AC-8 sweep test to `focus-ring-baseline.spec.ts` — red while the doc
      still says "today an unstyled one".
- [ ] **Step 2:** settle the note; add the ledger row for `focus-visible:outline-[#0a3f4e]` ×4;
      add the skill rule (the baseline lives in `@layer base`; a control never writes
      `outline-none`/`outline-hidden`; fixed-dark hosts override the colour with
      `focus-visible:outline-white`, clipped hosts the offset) and the red flag; the CLAUDE.md
      a11y bullet.
- [ ] **Step 3:** `npx vitest run src/app/shared/focus-ring-baseline.spec.ts` → PASS; `npm run lint`, `npm run format:check`.
- [ ] **Step 4: Commit** — `git commit -m "Record the focus-ring baseline in the design docs and skills (#890)"`
- [ ] **Step 5:** `node scripts/check-plan-file-structure.mjs --diff origin/main` → clean.

---

## Phase 3 — Gates

Merge `origin/main`, push, check CI, mark ready for review, run the review gate per
`riviera-sdlc` `references/pr-gates.md` §1, the Sonar gate §2, `riviera-docs-freshness`, then
the merge close-out §3.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-02 | Phase 0 — the base rule paints an offset-2 ring, which an `overflow-hidden` ancestor clips | buttons inside an `overflow-hidden` ancestor; enumerated by file, then each host read for what it actually encloses | `grep -rln overflow-hidden frontend/src/app --include=*.ts --include=*.html \| grep -v spec` → 12 files, then `<button` lines per file | `app.html` (the clipped box is the `z-[-1]` background layer, no button inside) · `venue-map.html` (photo-band button already inset; set tiles carry their own ring) · `availability-calendar.html` (a 3px bar inside the button) · `booking-dialog.ts`, `home.html`, `photo-lightbox.ts` (explicit sites, absolutely-positioned ≥6px from the clipped edge) · `payouts-tab.html` (both clipped cards enclose skeletons/rows, not the two buttons) · `admin-venue-photos.ts` (clips only the `<img>`) · `payout-statement.ts` (Close sits in a `px-6 py-4` header; a 5px ring fits) · **`photo-gallery-grid.ts`: three `h-full w-full` tiles flush to a `rounded-[26px] overflow-hidden` grid — clipped** | fix the gallery grid at the primitive (Phase 1); nothing else |
| 2026-09-02 | review fix F-1 — the themed ring on a host that does not follow the theme | buttons whose ring paints over a FIXED (non-theming) light fill outside the porcelain-pinned consoles; enumerated by the fills, then each host read for what it encloses | `grep -rlE 'bg-white\b\|bg-\[#f[0-9a-f]{5}\]\|bg-\[rgba\(255' frontend/src/app --include=*.ts --include=*.html \| grep -v spec \| grep -v '^frontend/src/app/\(operator\|admin\)'` → 11 files, then `<button` per file | **`app.html`: the sign-out bar (fixed white, both themes) — its two buttons had no ring colour: fixed** · `booking-view.ts`: buttons inside the fixed-fill banners carry explicit rings already (`btnCta` white; the outline skins on `BTN`/`BTN_OUTLINE`) — pre-existing explicit sites, not this baseline's paint, out of scope · `auth-page.ts`, `booking-pay.ts`, `home.html`, `photo-slideshow.ts`, `booking-dialog.ts`: the near-white literal is the BUTTON's own fill on a themed host, or an explicit ring; the ring paints over the themed host · `confirm-with-reason.ts`: admin-only (pinned) · `day-availability.ts`, `status-chip.ts`, `booking-qr.ts`: no button, or explicit `outline-[#0a3f4e]` (the ledger row) | pin the bar's ring to its own ink; the calendar's four hex rings are the same mechanism, already explicit — their ledger row now says so |

---

## Acceptance-criteria verification (final)

- [x] **AC-1..3, AC-8:** `cd frontend && npx ng test --include src/app/shared/focus-ring-baseline.spec.ts` → 4 passed. Verified at Phase 2 (AC-1..3 at `df74334`).
- [x] **AC-4:** `npx ng test --include src/app/shared/photo-gallery-grid.spec.ts` → PASS. Verified at `0e65126`.
- [x] **AC-5..7:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test -c playwright.a11y.config.ts e2e/focus-ring-baseline.e2e.ts` → 3 passed. Verified at `0e65126`.
- [x] **AC-9:** the same two commands → the guard spec 5 passed, the e2e 4 passed. Verified at `84b5874a`.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [x] **Availability** section filled (or justified N/A); concurrency test present (invariant #2).
- [x] Pool + cutoff rules honored (invariants #3, #4).
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based (invariant #11).
- [x] **Payment/payout** section filled (or N/A); webhooks are source of truth; idempotent; money in minor units; payout exactly-once (invariants #5, #8, #9).
- [x] Refund policy enforced server-side (invariant #10).
- [x] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6).
- [x] Booking codes unguessable (invariant #7).
- [x] Flyway migration present for schema changes; invariant-enforcing constraints tested (invariant #12).
- [x] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register (no finding row left `open` without a decision).
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing `merged via PR #NN`.
- [x] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone. If tooling blocked the review, that is stated in the PR and its checkbox is left unticked.
