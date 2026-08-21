# App-shell & Booking SCSS→Tailwind Migration Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Retire `app.scss`, `booking-pay.scss`, `booking-confirmation.scss` and
`my-bookings.scss` (≈1,212 lines) in favour of Tailwind utilities with zero computed-style
drift — except one deliberate change: the booking skeleton pulses (`animate-pulse` +
`motion-reduce:animate-none`) on the `--riv-card-track` token, like the app's other two
skeletons.

**Architecture:** Utility-first migration per `riviera-tailwind` (no `@apply`, share via
directives, retain test-hook classes as inert markers). The one structural decision: with
`.btn-primary`/`.link` becoming call-site utilities, the encapsulation constraint that
forced `a[appManageBookingLink]` is gone, so the component moves to the element form
(`app-manage-booking-link`, `class: 'contents'` host, variant input) that
`riviera-tailwind` rule 1 prescribes for `<a>` primitives — and drops its
`elements-content` `allowList` entry.

**Persistence:** JDBC only (invariant #1). No tables/migrations touched — frontend-only.

**Source of intent:** GitHub issue #739 (the maintainer-granted migrate-on-touch deferral
record from #737).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that
`app.scss` grew to 507 lines since the issue, and that the `riv-pop` keyframe has two
consumers outside `app.scss`) · `riviera-plan-doc` (this template — forced the parity
ledger below and the class-retention sweep into ACs) · `tdd` (skeleton/a11y/link-contract
specs go red before the styling moves) · `riviera-review-overlay` (review gate — at
ready-for-review) · `riviera-docs-freshness` (due over this slice's diff:
`riviera-tailwind` SKILL.md's remaining-`.scss` inventory and `styles.scss`'s
"see app.scss" guard note go stale here — both to be updated in this PR) · `riviera-tailwind`
(migration checklist, no-drift rule, idiom table, the `<a>`-primitive rule that decides
the manage-link refactor) · `riviera-frontend` (placement: no files move; e2e stays in
the mocked suite) · `angular-developer` + angular-cli MCP (v22 posture: `host` object
bindings, `[class]` merge semantics, no `ngClass`) · `riviera-local-debug` (cloud
recipes: `PW_CHROMIUM_EXECUTABLE` for the mocked e2e; scoped test runs) ·
`playwright-cli` (the scratch computed-style parity spec, excluded via
`.git/info/exclude`).

**Branch:** `claude/sdlc-739-liemd2` — the session's designated remote branch stands in
for `feature/scss-migration-shell-booking` (riviera-sdlc cloud addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the My-bookings page-level or per-row loading state, when the
  skeleton renders, then every `.skeleton` element carries `animate-pulse` **and**
  `motion-reduce:animate-none`, and its fill is the `--riv-card-track` token (not
  `rgba(12,42,51,0.1)`). *Pinned by:* `my-bookings.spec.ts` ("skeleton pulses, guarded
  for reduced motion").
- [ ] **AC-2:** Given the page-level loading state, when it renders, then the skeleton
  container is `aria-hidden="true"` behind a visually-hidden "Loading your bookings…"
  line in an `aria-live="polite"` region (the Discover/set-editor posture), while the
  **per-row** loading state keeps `aria-busy="true"` (it marks a known booking still
  resolving inside a real list). *Pinned by:* `my-bookings.spec.ts` (posture spec, per
  the `set-editor.spec.ts` #721 shape; existing line 307 aria-busy assertion stays).
- [ ] **AC-3:** Given the migration is complete, when `git ls-files '*.scss'` runs, then
  `app.scss`, `booking-pay.scss`, `booking-confirmation.scss` and `my-bookings.scss` are
  gone, no `styleUrl` remains on those four components, and `npm run build` passes.
- [ ] **AC-4:** Given the 14 externally-queried classes (sweep table in File structure
  notes), when the full unit suite and the mocked e2e suite run, then every spec passes
  **unmodified** except the three deliberately-changed contracts (AC-1/AC-2 posture
  specs, AC-5 link spec). *Pinned by:* `npm test` + `npm run test:e2e:a11y`.
- [ ] **AC-5:** Given `app-manage-booking-link` owns its anchor (element selector,
  `contents` host, `variant` input, `code` input building `['/booking', code]`), when
  lint runs, then the `elements-content` `allowList` entry is removed and
  `npm run lint` passes; the label and `manage-link` testid land on the inner anchor.
  *Pinned by:* rewritten `manage-booking-link.spec.ts`.
- [ ] **AC-6:** Given a computed-style snapshot of the migrated surfaces captured on
  `main` (both themes; header, brand, nav, chip button, popovers, mobile menu, footer,
  main, pay cards/summary/buttons, confirmation card, booking rows/CTA), when the same
  snapshot runs on the migrated build, then values are identical — allowing Chromium's
  border-width snapping and the AC-1 skeleton change. *Verified by:* scratch Playwright
  spec (uncommitted, `.git/info/exclude`d), results quoted in the PR.
- [ ] **AC-7:** Given the migration deletes `app.scss`'s `.riv-pop-in` class, when
  `admin-privacy.ts` and `booking-dialog.ts` render, then the global `riv-pop` keyframe
  still exists in `styles.scss` and their `[animation:riv-pop_…]` utilities still
  animate. *Pinned by:* `styles.scss` untouched keyframes + `test:e2e:a11y`
  (`theme-shell.e2e.ts` animation waits on `.riv-theme-pop`/`.riv-account-pop`).

## Non-goals

- The remaining legacy stylesheets: `auth.scss`, `request-confirmation.scss`,
  `find-booking.scss` — their own touches under migrate-on-touch (issue #739 scope).
- The `home.scss` scrim — the standing justified SCSS holdout.
- No new `--riv-*` tokens, no theme changes, no touch-target re-marking sweep.
- No edit to any `*.contrast.spec.ts` (the issue's hard rule).
- `request-confirmation.ts`'s own `btn-primary`/`code-card` classes — styled by its own
  (out-of-scope) stylesheet; untouched by the booking-pay/confirmation migration.

## Behavior-parity ledger (retirement / replacement slices only)

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Blob drift animation (18s/22s, reversed) + reduced-motion off-switch | preserved | `animate-[riv-drift_18s_ease-in-out_infinite]` (+`_reverse`) + `motion-reduce:animate-none`; keyframe stays global in `styles.scss`; `theme-shell.e2e.ts:269` pins the reduced-motion answer |
| Header glass on a `::before` (backdrop-filter on the header itself would shrink fixed descendants' backdrops — Filter Effects L2) | preserved | `before:` utilities carry the same pseudo-element; the one-line why stays as an HTML comment |
| `.riv-bg` at `z-index:-1`, `<main>` unpositioned (modals must beat the sticky header) | preserved | `-z-10` on the bg layer; `<main>` gets no positioning utility; `booking-flow.e2e.ts:152` hit-test pins it |
| Desktop nav ≥640px / hamburger <640px | preserved | `sm:` variants (Tailwind `sm` = 640px exactly) |
| Popover entry animation (`riv-pop` 0.2s) + reduced-motion off | preserved | `animate-[riv-pop_0.2s_ease]` + `motion-reduce:animate-none`; `theme-shell.e2e.ts` awaits these animations before axe runs |
| Mobile swatch: 44px hit target, 30px `::before` dot, hover scale, active ring | preserved | `before:` utilities; active ring via full `[class]`-ternary shadow swap (no two same-property utilities competing — rule 3) |
| `riv-legacy-surface` opaque compat panel toggled by route data | preserved | static `class="flex-1"` + `[class]` ternary adding `bg-[#f8fafc] text-[#0f172a]` and the inert `riv-legacy-surface` marker (`app.spec.ts:419-454` pins it) |
| Chip/menu-button hover brightness under `@media (hover:hover)`; transitions with reduced-motion off | preserved | `hover:` compiles under `(hover:hover)` in v4; `motion-reduce:transition-none` |
| Pay page: sticky summary ≥720px, two-column grid | preserved | `min-[720px]:` arbitrary breakpoint (not `md:` = 768px — no-drift rule) |
| Pay spinner (0.8s linear) + reduced-motion off | preserved | `animate-[spin_0.8s_linear_infinite]` (Tailwind's own `spin` keyframe) + `motion-reduce:animate-none` |
| `.sr-status` visually-hidden live region | preserved | Tailwind `sr-only`; `data-testid="pay-status"` unchanged |
| Manage-booking link: caller's anchor, page-scoped skin | **changed** | component owns the anchor (element form + `variant` input) — the encapsulation constraint the attribute form worked around is lifted by this very migration (issue #739 §"One constraint to lift"); label/testid contract unchanged |
| My-bookings skeleton: static flat fill `rgba(12,42,51,0.1)` | **changed** | pulses on `bg-(--riv-card-track)` — the issue's explicit ask (AC-1) |
| Page-level loading `aria-busy` with silent skeleton | **changed** | Discover/set-editor posture: `aria-hidden` skeleton + announced sr-only line (AC-2); per-row `aria-busy` preserved |
| Row hover lift + shadow, retry hover fill, focus-visible rings (2.4.7) | preserved | `hover:`/`focus-visible:` utilities, same values; ring colours unchanged (`--riv-accent-ink` / white on CTA) |
| Booking-code letter-spacing/typography, dashed code-card border, done/fail badges (solid composite fills) | preserved | same literal values as utilities; contrast specs stay byte-identical |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A dropped class is queried somewhere the sweep missed | low | med | Explore-agent sweep (14 hits retained as inert markers); full `npm test` + mocked e2e; "empty search ≠ absence" double-checked with bare-name greps | agent | closed — AC-4: 1594 unit + 232 e2e green, suite unmodified |
| R-2 | Same-property utility pairs resolve by stylesheet order, not class order (radius/display/shadow coin-flip) | med | med | never two competing utilities on one element: full-swap `[class]` ternaries (swatch ring), per-element widths (skeleton lines) | agent | closed — AC-6 diff shows no ordering flip |
| R-3 | Pseudo-element ports (`riv-header::before` glass, swatch `::before`) drift subtly | med | high | AC-6 computed-style snapshot targets those exact elements in both themes | agent | closed — header `::before` and swatch `::before` byte-identical (after F-1) |
| R-4 | Deleting `.riv-pop-in` while sweeping "riv-pop" breaks `admin-privacy`/`booking-dialog` keyframe consumers | low | high | AC-7; `styles.scss` keyframes untouched | agent | closed — theme-shell e2e green; keyframes intact (+`pay-spin`) |
| R-5 | Touch-target floor regresses on links whose `display` moves (min-height no-op on inline) | low | high | keep `inline-flex items-center min-h-11` shapes; `touch-targets*.e2e.ts` measures; TT guard on diff | agent | closed — touch-target e2e green in the 232 + re-run |
| R-6 | `manage-booking-link` refactor changes a contract e2e depends on | low | med | sweep found zero e2e queries of `manage-link`; unit spec rewritten deliberately (AC-5) | agent | closed — AC-5 verified |
| R-7 | `text-sm`-style named utilities smuggle in line-height drift | med | med | arbitrary values only (`text-[14px]`, `min-[720px]:`), per the idiom table; AC-6 catches leaks | agent | closed — AC-6 clean |

## Open questions / Assumptions

### Resolved

- **Element-form refactor of `ManageBookingLink`** — shipped as its own commit
  (`Manage-booking link owns its anchor`); the review gate raised no objection.
- **Skeleton fill `rgba(12,42,51,0.1)` → `--riv-card-track`** — sanctioned by the issue
  text; shipped in phase 1 and declared in the AC-6 diff.

## Availability & concurrency (invariant #2)

N/A — styling-only migration; no booking/availability logic, endpoints, or state
machines change. The booking-pay state machine, poll, and every `data-testid` are
untouched (restyle-only, as its TSDoc already records).

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

### Module ownership (§4a)

N/A — frontend-only; no behavior added or moved across module boundaries. All files stay
in their current `riviera-frontend` folders (`booking/`, `src/app` shell, `shared/`
untouched).

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment logic in scope. The pay page is restyled only; confirmation remains
webhook-driven (invariant #8), and no Stripe integration code changes.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `app.ts` / `app.html` (+ delete `app.scss`) | existing | standalone shell component | signals (unchanged) | — |
| FE-2 | `booking/booking-pay.ts` (+ delete `.scss`) | existing | standalone, inline template | signals (unchanged) | — |
| FE-3 | `booking/booking-confirmation.ts` (+ delete `.scss`) | existing | standalone, inline template | signals (unchanged) | — |
| FE-4 | `booking/my-bookings.ts` (+ delete `.scss`) | existing | standalone, inline template | signals (unchanged) | — |
| FE-5 | `booking/manage-booking-link.ts` | existing → element form | standalone, `contents` host | `input()` ×2 (`code` required, `variant`) | — |

**Standards:** standalone, `inject()`, `@if`/`@for`, `input()` signal APIs, `[class]`
bindings (no `ngClass`). No deviations.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** merge close-out — DONE (merged via PR #740)

**Next action:** none — slice complete. Deferred findings live on #741 (skeleton live-region posture) and #742 (venue-map transition property).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan doc + draft PR | ✅ | `Plan the app-shell and booking SCSS migration` · PR #740 (draft) |
| 1 — my-bookings migration + pulsing skeleton (AC-1/AC-2) | ✅ | `My bookings: Tailwind migration + pulsing skeleton` — red→green (2 new specs), 42 my-bookings + 279 booking specs, lint + TT/IC guards clean |
| 2 — booking-confirmation migration | ✅ | `Booking confirmation: Tailwind migration` — 13 specs green unmodified |
| 3 — booking-pay migration | ✅ | `Booking pay: Tailwind migration` — 36 specs green unmodified; pay-spin keyframe now global in styles.scss |
| 4 — manage-booking-link element form + allowList drop (AC-5) | ✅ | `Manage-booking link owns its anchor` — spec rewritten red→green; allowList + component-selector overrides dropped; 281 booking specs + lint green |
| 5 — app-shell migration (AC-3) | ✅ | `App shell: Tailwind migration` — 53 app specs; full suite 1594 green; lint + build green |
| 6 — verify sweep: e2e + computed-style parity (AC-4/AC-6/AC-7), docs freshness | ✅ | `Verify sweep: parity fix + docs freshness` — 232 mocked e2e green unmodified; 135-element × 2-theme computed-style diff clean after one fix (F-1); SKILL.md inventory 8→4 |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | AC-6 parity harness (pre-push) | mobile theme-swatch dot used `before:bg-(--riv-swatch)` — the *color* form — on a gradient token, rendering no dot | fixed in phase-6 commit (`bg-(image:--riv-swatch)`); generalization audit swept all color-form `bg-(--riv-*)` uses — no other member |
| F-2 | review (`/code-review` fork, 2026-08-21) | row hover lift lost its ease: `[transition:transform_…]` beside `hover:-translate-y-0.5`, but v4 translate utilities animate the `translate` property (verified in the built CSS) | fixed — transitions name `translate`; parity re-capture shows only the deliberate property rename |
| F-3 | review (same run) | swatch-dot hover scale unesed for the same reason (`scale` property vs `transform` transition) | fixed — `before:[transition:scale_0.12s_ease]` |
| F-4 | review (same run) | page-level loading `aria-live` region enters the DOM already holding its text, so most SR combos won't announce it — internally inconsistent with the live-region rule booking-pay.ts documents | deferred → issue #741 (the identical Discover/set-editor posture shipped in #675/#721; a fix belongs to all three surfaces at once, not this restyle) |
| F-5 | review (same run) | row/CTA/popover/card-surface recipes duplicated up to 6× instead of hoisted | fixed — `cls` consts per the `booking-view.ts` idiom in my-bookings, app shell, booking-pay, booking-confirmation |
| F-6 | review fix-round generalization | the F-2/F-3 mechanism (`transition` naming `transform` while a v4 translate/scale utility animates) exists once outside this diff: `venue-map.html:194` | deferred → issue #742 (pre-existing, outside this slice's surface) |

---

## File structure

- `docs/plans/shell-booking-scss-migration.md` — this plan.
- `frontend/src/app/app.html` — shell template: classes → utilities; inert markers kept.
- `frontend/src/app/app.ts` — drop `styleUrl`; `[class]` ternary for the legacy surface.
- `frontend/src/app/app.scss` — deleted.
- `frontend/src/app/booking/booking-pay.ts` — inline template → utilities; `host` class; drop `styleUrl`; manage-link call site.
- `frontend/src/app/booking/booking-pay.scss` — deleted.
- `frontend/src/app/booking/booking-confirmation.ts` — inline template → utilities; drop `styleUrl`; manage-link call site.
- `frontend/src/app/booking/booking-confirmation.scss` — deleted.
- `frontend/src/app/booking/my-bookings.ts` — inline template → utilities; pulsing skeleton; loading posture; drop `styleUrl`.
- `frontend/src/app/booking/my-bookings.scss` — deleted.
- `frontend/src/app/booking/my-bookings.spec.ts` — AC-1/AC-2 assertions (set-editor precedent shape).
- `frontend/src/app/booking/manage-booking-link.ts` — element form, `contents` host, `code`/`variant` inputs.
- `frontend/src/app/booking/manage-booking-link.spec.ts` — rewritten contract spec.
- `frontend/eslint.config.js` — drop the `appManageBookingLink` `elements-content` allowList entry.
- `frontend/src/styles.scss` — update the stale "see app.scss" guard-location note (keyframes untouched).
- `.claude/skills/riviera-tailwind/SKILL.md` — remaining-`.scss` inventory: 8 → 4 files (docs freshness).

---

## Phase 0 — Plan doc + draft PR

**Files:** Create `docs/plans/shell-booking-scss-migration.md`

- [ ] **Step 1:** Commit this plan; push; open the draft PR (CI vehicle, #417 rule).

## Phase 1 — my-bookings + pulsing skeleton

**Files:** Modify `my-bookings.ts`, `my-bookings.spec.ts` · Delete `my-bookings.scss`

- [x] **Step 1 (red):** extend `my-bookings.spec.ts`: skeleton spans carry
  `animate-pulse` + `motion-reduce:animate-none` (both call sites); page-level loading is
  `aria-hidden` + announced sr-only line; per-row keeps `aria-busy` (existing assertion).
  Run `npm test -- --include '**/my-bookings.spec.ts'` → FAIL.
- [x] **Step 2 (green):** port `my-bookings.scss` to utilities in the inline template
  (host `class: 'block text-(--riv-card-ink)'`); skeleton →
  `animate-pulse motion-reduce:animate-none` + `bg-(--riv-card-track)` per line; retain
  `.code` (spec-queried) and `skeleton`/`row` markers; delete the stylesheet. → PASS.
- [x] **Step 3:** scoped regression: `npm test` (booking specs) + lint + TT guard.
- [x] **Step 4:** commit + update Execution status.

## Phase 2 — booking-confirmation

**Files:** Modify `booking-confirmation.ts` · Delete `booking-confirmation.scss`

- [x] Port to utilities (card surface = `appCardGlass` + its own blur/shadow/radius
  extras); keep `manage-link` call-site anchor as-is this phase; delete stylesheet;
  specs stay green unmodified.

## Phase 3 — booking-pay

**Files:** Modify `booking-pay.ts` · Delete `booking-pay.scss`

- [x] Port to utilities: `%card-surface` extras repeated per surface (template repetition
  is the norm — home/set-editor precedent); `sr-status` → `sr-only`; spinner →
  `animate-[pay-spin_0.8s_linear_infinite]` (keyframe moved to `styles.scss` — Tailwind
  emits its own `spin` keyframes only for the named utility, not arbitrary values);
  retain `pay-done`/`pay-checkout` markers (`btn-primary` unqueried outside the phase-4
  spec — dropped); grid via `min-[720px]:`; delete stylesheet. a11y + unit specs green
  unmodified.

## Phase 4 — manage-booking-link element form

**Files:** Modify `manage-booking-link.ts`, `manage-booking-link.spec.ts`,
`booking-pay.ts`, `booking-confirmation.ts`, `eslint.config.js`

- [x] **Red:** rewrite the spec for the element contract (owns anchor, `variant` skins,
  label + testid on the anchor). **Green:** element selector + `contents` host +
  `RouterLink`; call sites swap to `<app-manage-booking-link [code]="…" variant="…" />`;
  drop the allowList entry AND the file's `component-selector` attribute-mode override
  (both #737 workarounds); lint passes.

## Phase 5 — app shell

**Files:** Modify `app.html`, `app.ts`, `styles.scss` · Delete `app.scss`

- [x] Port the 507 lines to utilities in `app.html`: bg/blobs (arbitrary `riv-drift`
  animations + `motion-reduce:animate-none`), header `before:` glass, nav (`sm:`),
  chip/menu buttons, popovers (`animate-[riv-pop_0.2s_ease]`), account/theme menus,
  mobile menu + swatches (`before:` dot, full-swap active ring), legacy-surface
  `[class]` ternary, footer. `z-[-1]` (not `-z-10`) keeps computed z-index parity.
  Retained markers: riv-bg, riv-blob, riv-blob-1/2, riv-header, riv-nav-desktop,
  riv-account-pop, riv-theme-pop, riv-legacy-surface, riv-footer, riv-footer-inner.
  Updated the `styles.scss` note. `app.spec.ts` / `app.a11y.spec.ts` green unmodified.

## Phase 6 — verify + docs freshness

- [x] `npm run lint` + `npm test` (1594) + `npm run build` +
  `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y` (232 green,
  suite unmodified).
- [x] AC-6 computed-style parity: scratch Playwright spec (`.git/info/exclude`d), 135
  elements × both themes across shell/menus/mobile/my-bookings/confirmation/pay states,
  before (origin/main worktree) vs after. One real defect found and fixed (F-1); the
  residue is representational (Tailwind's transparent shadow-var stack, `rounded-full`'s
  huge-px radius, `left`→`start`, zero-width border colors, inert `align-items` on the
  two `display:block` links) plus the two declared skeleton changes.
- [x] `riviera-tailwind` SKILL.md inventory 8→4; `node
  scripts/check-plan-file-structure.mjs --diff origin/main` green with the plan staged.
- [x] Mark ready for review → gates (`references/pr-gates.md`).

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-21 | Phase 4 (attribute→element form) | components whose attribute selector sits on a native element with component-supplied content (the lint-blindness mechanism) | `grep -rn "selector: '[a-z]\+\[app" frontend/src/app` | `p[appCutoffNote]`, `p[appAdminForbidden]`, `p[appLegalConsent]`, `div[appLegalFooter]`, `a[appManageBookingLink]` | only the `<a>` moves to element form — `<p>`/`<div>` are rule 1's text-container branch, correctly attribute-form |
| 2026-08-21 | Phase 6 / F-1 (color-form utility on a gradient token) | every color-form `bg-(--riv-*)` utility, judged against the gradient-valued tokens in `styles.scss` | `grep -rho "bg-(--riv-[a-z-]*)" frontend/src/app` × `grep -n gradient frontend/src/styles.scss` | 11 distinct color-form uses; 6 gradient tokens | no overlap after the F-1 fix — every gradient token is consumed via `bg-(image:…)` |

---

## Acceptance-criteria verification (final)

- [x] **AC-1/AC-2:** `npm test -- --include '**/my-bookings.spec.ts'` → 42 pass incl.
  the pulse + posture specs (red first, then green in phase 1).
- [x] **AC-3:** `git ls-files '*.scss'` → only `home.scss`, `auth.scss`,
  `request-confirmation.scss`, `find-booking.scss`, `styles.scss` remain; `npm run
  build` green.
- [x] **AC-4:** `npm test` (1594) + `npm run test:e2e:a11y` (232, suite files
  unmodified) all green; only the declared spec files changed.
- [x] **AC-5:** `npm run lint` green with the allowList entry and the
  `component-selector` override removed.
- [x] **AC-6:** 135-element computed-style snapshot × both themes: 0 rendering diffs
  outside the declared skeleton change (F-1 found by this harness and fixed).
- [x] **AC-7:** `theme-shell.e2e.ts` animation waits green in the suite run;
  `styles.scss` keyframes untouched (one added: `pay-spin`, moved from
  `booking-pay.scss`).

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced (invariant #1 — frontend-only).
- [x] **Availability** section justified N/A (invariant #2 — no logic change).
- [x] Pool + cutoff rules honored (invariants #3, #4 — untouched).
- [x] **Modulith** section justified N/A (invariant #11 — frontend-only).
- [x] **Payment/payout** justified N/A (restyle only; state machine untouched).
- [x] Refund policy untouched (invariant #10).
- [x] Timezone untouched (invariant #6).
- [x] Booking codes untouched (invariant #7 — codes never logged by the scratch spec).
- [x] No schema change (invariant #12).
- [x] **Frontend** standards met; no `as any`.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, findings.
- [ ] Risk register closed (R-1–R-7 all resolved by the AC-4/AC-6 verification); Open
  Questions resolved below.
- [x] **Close-out written in THIS PR** — final state cites `merged via PR #740`.
- [ ] **The review gate ran in full** — `/code-review` fan-out + `riviera-review-overlay`.
