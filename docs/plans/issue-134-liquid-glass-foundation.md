# Liquid Glass Foundation (T1) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The tourist app renders inside the Liquid Glass shell — token-driven themed
gradient background with drifting blobs, sticky glass header with responsive nav, and a
persisted two-theme switcher (`riviera` dark / `porcelain` light) — with every legacy
page still legible and every existing test green.

**Architecture:** Themes are **CSS custom properties scoped by a `data-riv-theme`
attribute on `<html>`**, written by a `core/` ThemeService (signal + localStorage +
`prefers-color-scheme` fallback); components consume tokens only, so palettes are data
(#143 adds 12 more without code). Legacy pages keep legibility through a **route-data
compat surface** (`data: { legacySurface: true }`) that wraps un-restyled routes in an
opaque panel; each later slice (T2–T5, operator epic) flips its route off the flag.

**Persistence:** N/A — frontend-only slice, no backend/tables touched (invariant #1 unaffected).

**Source of intent:** issue #134 (epic #133); design `docs/design/riviera-sunbeds-liquid-glass-v2.dc.html`
(header, background, THEMES map: `riviera`, `porcelain`); intake note
`docs/design/2026-07-02-liquid-glass-redesign-note.md`.

**Skills consulted:** `riviera-frontend` (theme state → `core/theme.ts`; tokens →
`styles.scss`; shell/header stays in root `app.ts`/`app.html`; e2e in the CI-safe
mocked suite), `angular-developer` + angular-cli MCP `get_best_practices` (Angular 22:
signals, `@Service`, host-object bindings, native control flow, axe/WCAG-AA mandatory),
`playwright-cli` (loaded at the e2e phase — spec authoring), `riviera-local-debug`
(loaded before the first `npm` run of the session).

**Branch:** `claude/design-riviera-sdlc-impl-7k89fc` — the session's designated remote
branch stands in for `feature/liquid-glass-foundation` (cloud-session addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given no stored theme and an OS `prefers-color-scheme: light`, when the
  app boots, then the active theme is `porcelain` (`<html data-riv-theme="porcelain">`);
  given no preference signal at all, the default is `riviera`. *Pinned by:*
  `theme.spec.ts` (matchMedia faked both ways).
- [ ] **AC-2:** Given the user picks a theme in the switcher, when the app reloads, then
  that theme is active (localStorage persistence). *Pinned by:* `theme.spec.ts`
  (service round-trip) + `theme-shell.e2e.ts` (reload persistence).
- [ ] **AC-3:** Given a viewport < 640px, when the shell renders, then nav collapses to
  the hamburger; opening it shows the glass menu (Beaches + theme swatch row); Escape or
  backdrop click closes it and focus returns to the menu button. *Pinned by:*
  `app.spec.ts` + `theme-shell.e2e.ts`.
- [ ] **AC-4:** Given each of the two themes, when the shell renders, then axe finds no
  violations and every shell token pair (ink/inkSoft/inkFaint on the background, chip
  text on chip bg, CTA text on CTA gradient) meets WCAG AA. *Pinned by:*
  `app.a11y.spec.ts`, `app.contrast.spec.ts`.
- [ ] **AC-5:** Given `prefers-reduced-motion: reduce`, when the shell renders, then the
  background blobs do not animate. *Pinned by:* `theme-shell.e2e.ts` (Playwright
  `reducedMotion: 'reduce'` emulation asserting computed `animation-name: none`).
- [ ] **AC-6:** Given a legacy route (`/venue-admin`, `/venue-admin/daily/:id`, and the
  not-yet-restyled tourist routes), when it renders on the themed background, then the
  content sits on the opaque compat surface. *Pinned by:* `app.spec.ts` (route-data →
  surface class) + existing per-page contrast specs staying green.
- [ ] **AC-7:** Given the whole existing FE test/e2e suite, when T1 lands, then it is
  green (existing `data-testid`s untouched). *Pinned by:* CI (`npm test`, e2e suite).

## Non-goals

- "How it works" nav item — no such page exists anywhere (the design's own handler is a
  no-op); add it when a page exists.
- "My bookings" nav entry (T6 #139), auth entry points (epic #108), page restyles
  (T2–T5), the 12 extra palettes (#143).
- No SSR considerations beyond not breaking `globalThis` guards (app is CSR).

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Legacy pages unreadable on the dark `riviera` background | high | high | route-data compat surface (AC-6); per-page contrast specs re-run | agent | resolved 7b4210a |
| R-2 | Glass token pairs fail WCAG AA (esp. white ink on translucent glass over bright gradient) | med | med | contrast spec per token pair per theme (AC-4); three tokens tuned vs design | agent | resolved a478285 |
| R-3 | Shell changes break existing e2e/a11y specs (selectors, landmarks) | med | med | keep existing `data-testid`s; run all suites before push (AC-7) | agent | resolved a478285 |
| R-4 | `backdrop-filter` unsupported browsers render low-contrast glass | low | low | opaque-ish rgba fallback baked into token values (they carry ≥0.5 alpha white) | agent | accepted (cosmetic) |
| R-5 | Theme attr written outside Angular (document) desyncs in tests | low | med | ThemeService is the only writer; specs assert through it | agent | resolved 622e691 |
| R-6 | Shell stacking/containing-block regressions vs page modals (found at review) | med | high | bg at z:-1, unpositioned main, glass on ::before; real-render elementFromPoint pins | agent | resolved a147e79 |

## Open questions / Assumptions

### Resolved

- **Assumption (kept, deferred to T5):** the design's system font stack replaces Manrope via the
  `--riv-font` token; the Manrope `<link>` is removed at T5 when the last tourist page restyles
  (page scss still consumes it — verified by the review's cross-file tracer). Carried on #138.
- **Assumption (confirmed at review):** pill + dropdown switcher kept — #143 adds palettes as data.

## Availability & concurrency (invariant #2)

N/A — visual shell only; no booking/availability/map behavior is touched.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `core/theme.ts` (+ `theme.spec.ts`) | new | `@Service` singleton | `signal` current theme; effectless writes to `document.documentElement` + localStorage in the setter | — |
| FE-2 | `app.ts` / `app.html` (+ specs) | modified | root shell component | signals: `menuOpen`, `themeOpen`; `computed` legacy-surface from router data | — |
| FE-3 | `styles.scss` | modified | token layer | `[data-riv-theme]` custom-property blocks + glass/animation utility classes | — |
| FE-4 | `app.a11y.spec.ts`, `app.contrast.spec.ts` | new | axe + contrast specs | — | — |
| FE-5 | `e2e/theme-shell.e2e.ts` | new | CI-safe mocked e2e | — | — |
| FE-6 | `app.routes.ts` | modified | route data | `data: { legacySurface: true }` on all current routes | — |

**Standards:** standalone, `inject()`, native control flow, host-object bindings (no
`@HostListener`), signals only; no `ngClass`/`ngStyle` (class/style bindings). Axe +
WCAG AA per the loaded best-practices guide.

## FE↔BE contract

N/A — no contract change.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Theme core (tokens + ThemeService) | ✅ | 622e691 |
| 1 — Shell (background, header, nav, switcher, compat surface) | ✅ | 7b4210a |
| 2 — a11y/contrast specs + e2e + full local FE suite | ✅ | (this commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

---

## File structure

- `frontend/src/app/core/theme.ts` — theme registry (2 palettes as data), ThemeService.
- `frontend/src/app/core/theme.spec.ts` — AC-1/AC-2 unit pins.
- `frontend/src/styles.scss` — `[data-riv-theme]` token blocks, glass utilities, keyframes, reduced-motion guard.
- `frontend/src/app/app.ts|html` — shell: background layer, header, menus, compat surface.
- `frontend/src/app/app.spec.ts` — shell behavior (menus, focus return, compat surface).
- `frontend/src/app/app.a11y.spec.ts` / `app.contrast.spec.ts` — AC-4.
- `frontend/src/app/app.routes.ts` — `legacySurface` route data.
- `frontend/e2e/theme-shell.e2e.ts` — AC-2/3/5 in a real browser (mocked APIs).

## Phase 0 — Theme core

Failing test first (`theme.spec.ts`): default resolution (riviera), light-OS fallback
(porcelain), explicit selection persisted and re-read, `data-riv-theme` written on the
document element. Then `core/theme.ts`: a `ThemeId = 'riviera' | 'porcelain'`, a
`THEMES` record (name + swatch metadata for the switcher; colors live in CSS), and
`ThemeService` (`@Service`) with `readonly theme` signal + `select(id)`. Tokens land in
`styles.scss`. Scope: `npm test -- --include='**/theme.spec.ts'` red → green. Commit.

## Phase 1 — Shell

Failing specs first (`app.spec.ts`): hamburger visibility/behavior, focus return,
Escape close, compat-surface class derived from route data, theme switcher renders both
themes and calls `ThemeService.select`. Then rewrite `app.html`/`app.ts` per the design
(background layer + header + menus), add `legacySurface` data to all current routes.
Scope: `app.spec.ts` + full component spec run. Commit.

## Phase 2 — a11y/contrast/e2e

`app.a11y.spec.ts` + `app.contrast.spec.ts` (both themes), `e2e/theme-shell.e2e.ts`
(persistence reload, mobile menu, reduced motion; APIs mocked via `page.route`, axe pass
like the sibling suites). Run the full FE unit suite + both e2e suites locally per
`riviera-local-debug`. Commit; push; CI gate.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-02 | Phase 2: reduced-motion override lost to component-style encapsulation specificity | other global-styles rules that must override component styles | `grep -n "prefers-reduced-motion\|animation" src/styles.scss src/app/*.scss` | only the blob/pop animations (both now guarded in app.scss where the animations live) | fixed in place; rule recorded: put motion guards in the same stylesheet as the animation |
| 2026-07-02 | Phase 2: axe sampled mid pop-in animation → false contrast fail | other e2e axe runs after opening an animated surface | `grep -n "expectNoSeriousAxeViolations" e2e/*.e2e.ts` | existing suites audit static pages; only theme-shell opens an animated popover before axe | wait-for-animations added; pattern noted for T2–T5 dialogs |

---

## Review-gate record (riviera-review-overlay + code-review, medium effort, pre-PR at a478285)

8 finder angles → 13 candidates → verified (cross-angle confirmation + direct code semantics).
**Fixed in a147e79:** (1) `<main>`/footer stacking contexts trapped the booking dialog below the
sticky header — Blocker, e2e-pinned; (2) `backdrop-filter` on the header made it the containing
block for the menus' fixed backdrops — Major, e2e-pinned; (3) e2e "riviera" axe sweeps actually
ran porcelain (headless boots light) — Major test gap; (4) `role=radio` without the radio
keyboard pattern → `aria-pressed` toggle buttons; toggle name violates Label-in-Name → name now
contains the visible label; (5) dead global reduced-motion guard removed; (6) axe e2e helper
extracted to `e2e/support/axe.ts` (was 8 copies); compositing math moved to
`testing/contrast.ts`; `ThemeOption.light` now drives the OS-light default; theme applied via
`provideAppInitializer`. **Declined with rationale:** extracting a shared shell()-fixture harness
for two spec files (indirection outweighs 6 duplicated lines). Overlay walk: RV-FE-* pass;
RV-BE-*/RV-CT-* N/A (frontend-only); RV-PROC-1 pass (Skills consulted covers FE + e2e areas).

## Acceptance-criteria verification (final)

- [x] **AC-1** theme default + OS fallback: `npm test -- --include='**/theme.spec.ts'` → 6/6 green (a147e79).
- [x] **AC-2** switch + persistence: theme.spec + `theme-shell.e2e.ts` persistence test → green (a147e79).
- [x] **AC-3** mobile menu open/Escape/focus-return/backdrop: app.spec + theme-shell e2e → green (a147e79).
- [x] **AC-4** axe + AA in both themes: `app.a11y.spec.ts`, `app.contrast.spec.ts`, e2e axe sweeps (riviera + porcelain, colorScheme pinned) → green (a147e79).
- [x] **AC-5** reduced motion: theme-shell e2e `reducedMotion: 'reduce'` → `animation-name: none` (a147e79).
- [x] **AC-6** compat surface: app.spec route-data cases + routes-flag spec → green (a147e79).
- [x] **AC-7** whole FE suite: unit 245/245, lint clean, mocked e2e 17/17 locally; push CI green at a478285 and re-verified after the fix push.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] No JPA / no backend change (invariant #1 trivially holds).
- [ ] Availability/Modulith/Payment sections justified N/A (frontend-only).
- [ ] Frontend standards met; no `as any`.
- [ ] Execution-status table at HEAD matches reality.
- [ ] Risk register has no stale `open` rows; Open Questions empty or deferred with issue #.
