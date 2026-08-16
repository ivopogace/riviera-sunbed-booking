# Per-theme color-scheme + pre-paint theme seed Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Under riviera the browser's native UI (date pickers, scrollbars, autofill,
selection) renders dark-scheme, deliberately light-styled fields keep light-scheme native
chrome, and a stored-porcelain visitor never sees a riviera flash before first paint.

**Architecture:** Two additions to the existing token architecture, no rework: (A) each
theme block in `styles.scss` declares `color-scheme` (riviera `dark`, porcelain `light`),
with Tailwind's `scheme-light` utility on the light-styled fields that must keep
dark-on-light native chrome; (B) a tiny guarded inline script in `index.html` pre-seeds
`data-riv-theme` before first paint with the SAME resolution order as
`core/theme.ts#initialTheme` — `ThemeService` stays the runtime single writer, and a unit
spec executes the inline script against a scenario table next to `ThemeService` so the two
resolution orders cannot drift silently. Nice-to-have in scope: a `matchMedia` change
listener so a user with NO stored choice follows a mid-session OS scheme switch.

**Persistence:** JDBC only (invariant #1). N/A — frontend-only, no tables/migrations.

**Source of intent:** GitHub issue #675 (post-#674 Tailwind-dark-mode-alignment review).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — confirmed the
issue matches today's code: two theme blocks, single-writer `theme.ts`, porcelain-pinned
operator/admin subtrees; surfaced that the porcelain pin gives those subtrees
`color-scheme: light` for free) · `riviera-plan-doc` (this template — forced the drift-pin
AC and the legacy-SCSS deferral to be recorded as a maintainer-visible decision) · `tdd`
(drift-pin + listener specs red first; e2e pre-paint pin red before the index.html seed) ·
`riviera-review-overlay` (review gate — run over the diff before push) ·
`riviera-docs-freshness` (ran over this slice's diff — no substrate-doc statement
contradicted: styles.scss/theme.ts comments updated in-diff; CLAUDE.md/RESPONSIBILITIES.md
say nothing about color-scheme or index.html) · `riviera-frontend` (theming ownership: the
document attribute stays `ThemeService`-only — the seed writes it once pre-boot, before
Angular exists; subtree pinning untouched) · `riviera-tailwind` (use `scheme-light`
utilities, not hand-written `color-scheme`, on components; share on the `FieldGlass`
directive host, not per-consumer; migrate-on-touch weighed for `home.html` +
`booking-dialog.ts` — see Open questions) · `angular-developer` + frontend CLAUDE.md (v22
posture: `@Service` singleton, signals; listener guarded for jsdom) · `playwright-cli`
(e2e authoring: bundle-abort pattern to prove the pre-paint attribute, computed-style
assertions per the no-drift rule) · `riviera-local-debug` (cloud recipe: scoped Vitest,
`PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium` for the mocked suite).

**Branch:** `claude/theme-color-scheme-prepaint-rhoo80` — the session's designated remote
branch stands in for `feature/theme-scheme-prepaint` (riviera-sdlc cloud addendum).

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given the riviera theme, when the shell renders, then the document's
  computed `color-scheme` is `dark`; switching to porcelain makes it `light`. *Pinned by:*
  `theme-shell.e2e.ts` "the document color-scheme follows the theme".
- [x] **AC-2:** Given riviera, when a deliberately light-styled field renders, then its
  computed `color-scheme` is `light` (dark-on-light native chrome). *Pinned by:*
  `theme-shell.e2e.ts` (computed style on home's `filter-date` under a dark document) +
  `venue-map.spec.ts` (class pin that `map-date` is in the swept set — jsdom computes no
  Tailwind CSS, so the computed proof rides the same utility in the e2e).
- [x] **AC-3:** Given a stored `porcelain` choice, when `index.html` is parsed with the app
  bundle withheld (Angular never boots), then `document.documentElement` already carries
  `data-riv-theme="porcelain"` and `<app-root>` is empty. *Pinned by:*
  `theme-shell.e2e.ts` "pre-paint theme seeding".
- [x] **AC-4:** Given every row of the resolution scenario table (stored valid / stored
  garbage / no stored × OS light / OS dark / blocked storage), when the `index.html` inline
  seed and `ThemeService` each resolve the boot theme, then they agree. *Pinned by:*
  `theme-boot.spec.ts` (executes the real inline script extracted from `index.html`).
- [x] **AC-5:** Given no stored choice, when the OS `prefers-color-scheme` flips
  mid-session, then the theme follows without reload; given a stored choice (pre-existing
  or via `select()`), the flip is ignored. *Pinned by:* `theme.spec.ts` OS-change cases.
- [x] **AC-6:** `npm test`, `npm run test:a11y`, and the mocked e2e suite
  (`test:e2e:a11y`) stay green, including the existing contrast specs.
- [x] **AC-7:** Given `npm run build`, when `dist/**/index.html` is inspected, then the
  inline seed script survives production index processing. *Verified by:* build + grep
  (recorded in Execution status; no CSP is set anywhere — see Risk R-5).

## Non-goals

- NO switch to `dark:` variants and no theme `@custom-variant` — components stay
  theme-agnostic; tokens do the switching (recorded in the issue as an explicit non-goal).
- No change to the theme set, the token registry shape, or the operator/admin porcelain
  subtree-pinning mechanism.
- No SCSS→Tailwind migration of the touched legacy-SCSS components (`home`,
  `booking-dialog`) — deferral maintainer-approved; follow-up: issue #679 (the touch is a
  single inert utility class per control, not styling work on those components).
- No `<meta name="theme-color">` / PWA chrome work.

## Behavior-parity ledger

N/A — new behavior, replaces nothing. (The seed writes the same attribute value
`ThemeService` would write moments later; AC-4 is the parity proof.)

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The inline seed's resolution order drifts from `theme.ts` (no shared constant reachable from `index.html`) | med | med | `theme-boot.spec.ts` executes the real script from `index.html` against the same scenario table as `ThemeService` (AC-4) | this slice | closed — pinned by theme-boot.spec.ts |
| R-2 | Blocked storage (private mode) makes the inline script throw before first paint | low | high | `try/catch` around storage access, same posture as `shared/safe-storage.ts`; blocked-storage scenario row in AC-4 | this slice | closed — pinned by theme-boot.spec.ts |
| R-3 | `color-scheme: dark` leaks into the porcelain-pinned operator/admin subtrees | low | med | verified pre-plan: the pin sets `data-riv-theme="porcelain"` on the subtree host, so the porcelain block's `color-scheme: light` applies there and inherits | this slice | closed — by construction |
| R-4 | Dark-scheme native chrome on deliberately light fields (white date field icon invisible, dark autofill tint on light glass) | high | med | `scheme-light` on: `FieldGlass` host (auth autofill fields), `map-date`, home's date+selects, booking-dialog's autofill inputs; AC-2 pins the worst case | this slice | closed — swept; pinned by theme-shell.e2e.ts + venue-map.spec.ts |
| R-5 | A deploy CSP blocks the inline script | low | high | verified: no CSP is set anywhere (`SecurityConfig` sets none; `docs/deploy/*` mention none; grep over `platform/src/main/java` + `docs/deploy` empty) | this slice | closed — verified 2026-08-16 |
| R-6 | Angular's production index processing strips or reorders the inline script | low | high | AC-7: `npm run build` + grep `dist` for the seed | this slice | closed — verified: seed present in dist index.html |

## Open questions / Assumptions

- **Assumption:** text fields without autofill/`autocomplete` (find-booking code input,
  confirm-with-reason reason input) don't need `scheme-light` — the only scheme-dependent
  native chrome they render is the selection highlight, legible either way. — *Owner:*
  this slice · *Resolves by:* review gate.

## Availability & concurrency (invariant #2)

N/A — does not affect availability: no booking/map data path is touched, only the CSS
scheme of already-rendered controls and the boot value of a DOM attribute.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `src/styles.scss` | existing | global tokens | — | — |
| FE-2 | `src/index.html` | existing | static shell (gains the inline seed) | — | — |
| FE-3 | `core/theme.ts` | existing | `@Service` singleton | signal + new `matchMedia` change listener | — |
| FE-4 | `core/theme-boot.spec.ts` | new | drift-pin unit spec | — | — |
| FE-5 | `shared/field-glass.ts` | existing | attribute directive (host class gains `scheme-light`) | — | — |
| FE-6 | `venue/venue-map.html`, `pages/home/home.html`, `booking/booking-dialog.ts` | existing | templates (gain `scheme-light` on swept controls) | — | — |

**Standards:** standalone, signals, `inject()`; no deviations. The listener is guarded so
jsdom (no `matchMedia`, or a fake without `addEventListener`) degrades to no listener.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** implemented + verified; pushed from the cloud session — PR/CI/Sonar/review gates due when the PR opens

**Next action:** PR opened → drive the CI, review, and Sonar gates to merge (RV-FE-7 deferral resolved → #679)

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan doc | ✅ | (this commit) |
| 1 — per-theme color-scheme + scheme-light sweep (Gap A) | ✅ | (this commit) |
| 2 — pre-paint seed + drift pin + e2e (Gap B) | ✅ | (this commit) |
| 3 — OS-change listener | ✅ | (this commit) |
| 4 — verification sweeps + build check | ✅ | (this commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | self-review (riviera-review-overlay, pre-push) | RV-FE-7 migrate-on-touch: `home.html` + `booking-dialog.ts` touched (one utility class each) while carrying legacy SCSS; migration deferred — needs maintainer confirmation | deferred → maintainer decision at PR review (see Open questions) |
| F-2 | self-review (riviera-review-overlay, pre-push) | all other bank items (RV-FE-1/2/3/4/5/6/8/9, RV-FE-E2E, RV-STYLE-1/2, RV-PROC-1) walked — clean; formal `/code-review` gate still due when the PR opens | closed (pre-push pass); gate re-runs at PR |

---

## File structure

- `docs/plans/theme-scheme-prepaint.md` — this plan.
- `frontend/src/styles.scss` — `color-scheme` declaration per theme block.
- `frontend/src/index.html` — the guarded pre-paint seed script.
- `frontend/src/app/core/theme.ts` — OS scheme-change listener (no stored choice only).
- `frontend/src/app/core/theme.spec.ts` — listener cases.
- `frontend/src/app/core/theme-boot.spec.ts` — NEW: executes the inline seed from
  `index.html` + `ThemeService` against one scenario table (the drift pin, AC-4).
- `frontend/src/app/shared/field-glass.ts` — `scheme-light` on the directive host.
- `frontend/src/app/venue/venue-map.html` — `scheme-light` on the `map-date` input.
- `frontend/src/app/pages/home/home.html` — `scheme-light` on the filter selects + date.
- `frontend/src/app/booking/booking-dialog.ts` — `scheme-light` on the three autofill inputs.
- `frontend/e2e/theme-shell.e2e.ts` — AC-1/AC-2 computed color-scheme + AC-3 pre-paint pin.
- `frontend/src/app/venue/venue-map.spec.ts` — AC-2 class pin on `map-date`.

---

## Phase 1 — Gap A: per-theme color-scheme + scheme-light sweep

**Files:** Modify `styles.scss`, `field-glass.ts`, `venue-map.html`, `home.html`,
`booking-dialog.ts`, `theme-shell.e2e.ts`, `booking-flow.e2e.ts`.

- [ ] Declare `color-scheme: dark` in the riviera block, `color-scheme: light` in porcelain.
- [ ] `scheme-light` on the swept light-styled controls (R-4 list).
- [ ] e2e: computed `color-scheme` follows the theme (AC-1); `map-date` stays light (AC-2).

## Phase 2 — Gap B: pre-paint seed + drift pin

**Files:** Modify `index.html`, `theme-shell.e2e.ts` · Create `theme-boot.spec.ts`.

- [ ] Red: `theme-boot.spec.ts` scenario table fails (no script in `index.html` yet);
  e2e pre-paint pin fails.
- [ ] Green: guarded inline seed in `index.html` head (stored → OS light → riviera).
- [ ] `npm test -- theme-boot` green; e2e pin green.

## Phase 3 — OS scheme-change listener

**Files:** Modify `theme.ts`, `theme.spec.ts`.

- [ ] Red: listener cases in `theme.spec.ts` (follow flip with no stored choice; ignore
  with stored; ignore after `select()`).
- [ ] Green: guarded `matchMedia('(prefers-color-scheme: light)')` change listener.

## Phase 4 — Verification

- [ ] `npm run lint`, `npm run format:check`, `npm test`, `npm run test:a11y` green.
- [ ] `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y` green.
- [ ] `npm run build` → seed script present in `dist/**/index.html` (AC-7).
- [ ] `node scripts/check-plan-file-structure.mjs --diff origin/main` clean.
- [ ] Visual: riviera date-picker screenshot via playwright-cli (if the harness allows).

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-16 | Phase 1 (scheme-light sweep) | every form control on a riviera-rendered surface (native chrome follows the nearest `color-scheme`) | `grep -rn "<input\|<select\|<textarea" frontend/src/app/{booking,venue,auth,pages,shared,customer}` (operator/admin excluded: porcelain-pinned hosts) | `map-date`; home's 2 selects + date; auth fields (via `FieldGlass`); booking-dialog ×3; find-booking code; confirm-with-reason reason | `scheme-light` on all autofill/date/select controls; the 2 plain-text controls skipped (Assumption 2) |

---

## Acceptance-criteria verification (final)

- [x] **AC-1..AC-3:** mocked suite run twice — 213/214 then 214/214 (the one first-run failure, `operator-venue.e2e.ts:223`, is an unrelated mocked 409 flow; it passed alone, as a file, and in the full re-run — a cold-compile load flake).
- [x] **AC-4, AC-5:** `npm test` green (17 theme tests incl. the 8-row drift table).
- [x] **AC-6:** `npm test` + `npm run test:a11y` + mocked e2e → green.
- [x] **AC-7:** `npm run build` + `grep -l rivTheme dist/frontend/browser/index.html` → hit.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced (invariant #1 — no backend code touched).
- [x] **Availability** section justified N/A (invariant #2 — no data path touched).
- [x] Pool + cutoff rules honored (invariants #3, #4 — untouched).
- [x] **Modulith** section N/A — frontend-only (invariant #11).
- [x] **Payment/payout** N/A (invariants #5, #8, #9 — untouched).
- [x] Refund policy untouched (invariant #10).
- [x] Timezone untouched (invariant #6).
- [x] Booking codes untouched (invariant #7).
- [x] No schema change (invariant #12).
- [x] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [x] Execution status at HEAD matches reality.
- [x] Risk register has no stale `open` rows; Open Questions resolved (RV-FE-7 deferral → maintainer-approved, follow-up issue #679).
- [ ] **Close-out written in THIS PR** — pending: the PR is opened by the maintainer/next session from the pushed branch; final close-out (merged via PR #NN) lands there.
- [ ] **The review gate ran** — a pre-push `riviera-review-overlay` pass ran (F-1/F-2); the formal `/code-review` invocation-ladder run is due when the PR opens and is deliberately left unticked until then.
