# SCSS→Tailwind: home + booking-dialog Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Retire `pages/home/home.scss` (434 lines → the justified scrim holdout only) and
`booking/booking-dialog.scss` (371 lines → deleted) by porting every rule to Tailwind
utilities, with zero computed-style drift proven by a real-browser before/after diff.

**Architecture:** Styling-only migration under `riviera-tailwind`'s migrate-on-touch rule
(deferred out of #675 by maintainer approval). The one significant decision: the riviera
hero scrim (`:host-context([data-riv-theme='riviera']) .hero`) **stays SCSS** — it is the
repo's documented justified holdout (theme-conditional, multi-stop, px-anchored gradient),
so `home.scss` survives as a minimal residue file restating that justification, while
`booking-dialog.scss` is deleted outright. Shared recipes already live at the directive
layer (`appCardGlass`, `appPanelGlass`, `appFieldGlass`); the field controls in both
components adopt `appFieldGlass` instead of restating its recipe (no new directive needed —
nothing else repeats across consumers).

**Persistence:** N/A — frontend-only; no tables or migrations touched (invariant #1 not in scope).

**Source of intent:** GitHub issue #679 (deferred migrate-on-touch follow-up from #675;
see `docs/plans/theme-scheme-prepaint.md`, Open questions — RV-FE-7 deferral).

**Skills consulted:** `riviera-sdlc` (routing — this slice enters at Plan with intent
already refined in #679) · `riviera-plan-doc` (this template — forced the behavior-parity
ledger below, which is the whole risk surface of a "restyle only" claim) ·
`tdd` (adapted: the red/green here is the computed-style baseline diff — captured red-free
BEFORE the migration, re-diffed after each phase) · `riviera-review-overlay` (review gate —
runs on the finished diff; RV-FE-7 is the item this slice discharges) ·
`riviera-docs-freshness` (ran over this slice's diff — 1 finding: the `riviera-tailwind`
SKILL.md remaining-SCSS inventory went stale (10→9 files, 6→5 in `booking/`), patched in
this slice) · `riviera-tailwind` (the migration
checklist + idioms: `text-[14px]` not `text-sm`, per-property `[transition:…]`,
`motion-reduce:`/`motion-safe:`, inert marker classes, no `@apply`, radius never in a
directive) · `riviera-frontend` (placement: no new files beyond this plan doc; confirmed
`shared/field-glass.ts` is the field recipe's home and the residue `home.scss` stays a
colocated grandfathered case) · `riviera-local-debug` (cloud-session recipes: mocked e2e
via `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium`, never `playwright install`) ·
`playwright-cli` implicitly via the existing mocked suite (no new committed specs).

**Branch:** `claude/issue-679-f6eui0` (session-designated; exists before phase 0 — the
`<feature>/<slug>` convention is overridden by the remote-session branch mandate).

---

## Acceptance criteria (testable)

> Styling-only slice: the pins are (a) the already-shipped spec suites staying green
> **untouched**, and (b) a one-time computed-style diff recorded in this plan doc.
> New permanent test classes would duplicate what the contrast/e2e suites already pin.

- [x] **AC-1:** Given the pre-migration baseline dump of `getComputedStyle` for every
  styled element of Discover (both themes) and the booking dialog (steps 1, 2, error
  state), when the same dump runs post-migration, then the diff is empty apart from
  deltas argued benign in the Findings register (e.g. Chromium's 1.5px→"1px"
  border-width snap does not apply here; `transition-property: none` vs absent-equivalent
  only under `prefers-reduced-motion`). *Pinned by:* the Phase-3 diff procedure recorded
  below (scratch spec, not committed).
- [x] **AC-2:** Given the migration, when `npm test` runs, then `home.contrast.spec.ts`
  and `booking-dialog.contrast.spec.ts` pass **without modification** (scrim geometry
  150px/13px/15px band and every pinned palette constant unchanged). *Pinned by:*
  `home.contrast.spec.ts`, `booking-dialog.contrast.spec.ts` (existing).
- [x] **AC-3:** Given the migration, when the mocked e2e suite runs, then
  `discovery-flow.e2e.ts` (hero/filter-bar geometry #153), `booking-flow.e2e.ts`
  (`.dialog-body` scroll fit), `theme-shell.e2e.ts` (`color-scheme` per theme + the
  `scheme-light` field opt-out, #675), `discover-photos.e2e.ts`, `request-to-book.e2e.ts`
  and `touch-targets-tourist.e2e.ts` pass unmodified. *Pinned by:* those existing suites.
- [x] **AC-4:** Given the migration, when specs query the semantic hooks
  (`.hero`, `.hero-chip`, `.filter-bar`, `.field`, `.photo-scrim`, `.photo-sun`,
  `.card-meta`, `.count-number`, `.avail-fill`, `.dialog-body`, `.booking-backdrop` …),
  then each still matches — retained as inert markers beside the utilities. *Pinned by:*
  `home.spec.ts`, `home.a11y.spec.ts`, `booking-dialog.spec.ts` (existing).
- [x] **AC-5:** Given `booking-dialog.scss` is deleted and `home.scss` reduced to the
  scrim holdout, when `git grep "styleUrl" frontend/src/app/booking/booking-dialog.ts`
  runs, then no `styleUrl` remains there, and `home.scss` contains only the documented
  `:host-context` scrim rule + header justification. *Pinned by:* code review (RV-FE-7).

## Non-goals

- The other eight SCSS files (`app.scss`, `auth.scss`, `operator-console.scss`,
  `booking-confirmation.scss`, `booking-pay.scss`, `find-booking.scss`, `my-bookings.scss`,
  `request-confirmation.scss`) — each migrates when its component is next touched.
- Any restyle, token change, or design tweak — the rendered pixels must not move.
- No new shared directives: the only repeated recipe (field surface) already exists as
  `appFieldGlass`; hypothetical extraction of dialog chrome waits for a second dialog
  migration (`find-booking.scss`) to prove the repetition.
- No touch-target changes — the #675 declarations (`appTouchTarget`, `scheme-light`) are
  preserved, not reworked (`scheme-light` moves into `appFieldGlass`'s host class where
  the directive is adopted, which is where it already lives for auth fields).
- Splitting into two PRs (the issue allows it): not taken — the two components share the
  verification harness, and one PR keeps one baseline/diff cycle.

## Behavior-parity ledger (retirement / replacement slices only)

> Restyle slice → mandatory. "No behavior change" verified behavior-by-behavior.
> TS logic, template control flow, ARIA and testids are untouched in both components;
> the rows below are the *style-carried* behaviors that could silently drop.

| Old-surface behavior | Verdict | How the new surface does it |
|---|---|---|
| Home: hover lift + deepened shadow on card, keyed on the **li** (slideshow controls keep the lift) | preserved | named `group/card` on the `<li>`, `group-hover/card:` utilities on the card (named so the controls' own unnamed `group` chevron tint is untouched; `hover:` semantics under `(hover:hover)` are Tailwind v4 defaults) |
| Home: hover lift suppressed under `prefers-reduced-motion` (transition + transform) | preserved | `motion-safe:` on the transition and the `group-hover:` translate — hover shadow/border still switch instantly under reduce, as before |
| Home: card focus ring (white 3px + accent halo shadow) | preserved | `focus-visible:` utilities on the card link |
| Home: `.card-chips:empty` removed from flex flow (no phantom 8px gap) | preserved | `empty:hidden` |
| Home: `--photo-band` custom property on each li (photo height + step-control centering) | preserved | `[--photo-band:150px]` on the li; consumers unchanged |
| Home: riviera-only hero scrim, px-anchored fades; shared hero padding across themes (no content shift) | preserved | scrim stays SCSS (justified holdout); padding moves to utilities on `.hero` (theme-independent, so anchor alignment is untouched) |
| Home: field focus ring (3px accent, offset 2) | preserved | `focus-visible:outline-…` utilities on each control |
| Home: `aria-live` count block height reservation (no bar jump) | preserved | `min-h-[53px] min-w-[3rem]` utilities |
| Dialog: backdrop above the sticky glass shell header (`z-index: 60`) | preserved | `z-60` on the host class |
| Dialog: `riv-pop` entry animation on the panel; suppressed under reduced motion | preserved | `[animation:riv-pop_0.26s_cubic-bezier(0.2,0.7,0.2,1)]` + `motion-reduce:[animation:none]` (global keyframes in `styles.scss`, unchanged) |
| Dialog: scroll body shrinks below content on short viewports (`min-height: 0`) | preserved | `min-h-0` on `.dialog-body` |
| Dialog: hover states (close brighten, back fill/border/shadow, primary brighten unless disabled) gated on `(hover: hover)` | preserved | `hover:` variants (v4 gates them) + `enabled:` on the primary |
| Dialog: hover transitions suppressed under reduced motion | preserved | `motion-safe:` on each transition utility |
| Dialog: white focus rings on close/back/primary; accent ring offset 1 on inputs | preserved | `focus-visible:` utilities per control |
| Dialog: step connector line via `.step:not(:last-child)::after` | preserved | `[&:not(:last-child)]:after:` arbitrary-variant utilities on `.step` |
| Dialog: disabled primary at 0.7 opacity, default cursor | preserved | `disabled:opacity-70 disabled:cursor-default` |
| Dialog: reduce-guard `animation: none` on the **backdrop** host | dropped | dead rule — no animation is ever declared on the backdrop, so the guard guarded nothing; computed styles identical |
| Home: hover shadow outranked the focus halo when a card was hovered **and** keyboard-focused (`li:hover .card` beat `.card:focus-visible` on specificity) | changed | `focus-visible:shadow-*` (0,2,0) now outranks `group-hover/card:shadow-*` (0,1,0), so the focus halo stays visible while hovering — a strictly better 2.4.7 posture; single-state renders are identical (both probed) |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Silent computed-style drift (a dropped `cursor`, a `text-sm` line-height, wrong easing) | med | high | Full-surface `getComputedStyle` baseline diff (Phase 0 vs Phase 3), both themes, dialog steps 1/2/error + state probes (hover, focus-visible); contrast specs stay untouched | agent | closed — final diff: 3 residual deltas, all argued benign in the Findings register |
| R-2 | Variant-ordering flips (`motion-reduce:` vs `group-hover:` both class-specificity 10, resolved by stylesheet order) | med | med | Sidestep ordering entirely: express the guard as `motion-safe:` on the motion-bearing utility, never as a competing `motion-reduce:` override of transform/transition | agent | closed — no `motion-reduce:` transform/transition overrides shipped (`motion-reduce:[animation:none]` on the panel competes with nothing) |
| R-3 | Element-selector styles (`.field select`, `.price strong`, `.mode-note strong`, `.sum-row dt/dd`) need classes on elements the SCSS reached anonymously | high | low | Put utilities directly on those elements; where a spec queries the parent class it stays as marker | agent | closed — done throughout; diff clean |
| R-4 | The `li:hover .card` lift semantics vs `group-hover` (group = nearest `.group` ancestor) | low | med | Named `group/card` on the li so the slideshow controls' own unnamed `group` is untouched; baseline hover probe confirms | agent | closed — hover probe byte-identical (`matrix(1,0,0,1,0,-5)`) |
| R-5 | Angular emulated encapsulation: SCSS rules carried `[_ngcontent]` specificity; utilities are global single-class. A global stylesheet rule that previously LOST to component SCSS could now win | low | med | The migrated properties are element-local (no competing global rules target these classes — checked `styles.scss`/`app.scss`); baseline diff would catch any flip | agent | closed — diff clean |
| R-6 | `:host` / `:host.booking-backdrop` styles must move to the component `host` class binding, changing where the classes live but not the box | low | low | `host: { class: … }` on both components; `.booking-backdrop` marker retained | agent | closed — backdrop dump identical |
| R-7 | Hygiene guards (inline-comments, touch-target, focus-posture) fire on the touched files | med | low | One-line inline comments only; header block comment for the residue `home.scss` justification; no touch-target/focus changes | agent | closed — all three guards pass on the diff |
| R-8 | Directive-vs-consumer same-property utilities (`min-w-11` from `appTouchTarget` vs `min-w-[168px]` on the filter controls) resolve by stylesheet order | med | med | Verified empirically against this repo's Tailwind build (probe compile): arbitrary values emit after theme values within a utility, so `min-w-[168px]` wins; the baseline diff pins the rendered 168px either way | agent | closed — select/input dumps identical |

## Open questions / Assumptions

None open.

### Resolved

- **Assumption:** single-PR scope (the issue allows a 2-PR split) — taken: one PR, one
  shared baseline/diff cycle; the phases stayed independently revertable. Resolved at
  implementation, recorded in the phase commits of this branch.

## Availability & concurrency (invariant #2)

N/A — styling-only; no availability read/write path, no booking lifecycle logic touched.
The booking dialog's submit flow (`BookingService.createBooking`) is byte-identical.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope (dialog copy and flows unchanged; invariant #8's
webhook-confirmation contract is untouched).

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `pages/home/home.html` + `home.ts` (host class) + `home.scss` (residue) | existing | standalone component | unchanged (signals) | N/A |
| FE-2 | `booking/booking-dialog.ts` (inline template + host class; `styleUrl` removed) | existing | standalone component | unchanged (signals) | unchanged (Signal Forms) |

**Standards:** no logic edits; `appFieldGlass` adopted on the five field controls (3 home
filter controls — replacing their literal `scheme-light` marker, which the directive
carries — and 2 dialog text inputs + phone/email). No deviations.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** merge close-out — merged via PR #691

**Next action:** none — slice complete (post-merge items are GitHub-only: issue #679
auto-closes via the PR; no parent epic).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — computed-style baseline | ✅ | (scratch only, git-excluded; dump: 144 entries, 0 missing) |
| 1 — migrate `home` | ✅ | this branch |
| 2 — migrate `booking-dialog` | ✅ | this branch |
| 3 — diff + full frontend gate | ✅ | this branch |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — F-1..F-3 are the residual computed-style deltas of the final
before/after diff (the normalized diff was otherwise empty), each argued benign:

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | Phase-3 diff | Tailwind representation deltas: `--tw-*`/theme custom props now enumerate in computed style; `box-shadow` carries fully-transparent zero-size placeholder layers from the var chain; `rounded-full` computes `calc(infinity*1px)` where SCSS said `999px` (both clamp to the half-box). Normalized in the diff as documented-benign; where an exact twin was cheap the utility mirrors it instead (`rounded-[50%]`, side-scoped `border-b-(--riv-card-track)`, arbitrary `[transform:…]` over `translate-*`) | closed — no rendered difference |
| F-2 | Phase-3 diff | `sum-row.total` `border-bottom-style` reads `solid` (preflight's `border: 0 solid`) where SCSS `border-bottom: 0` read `none` — width is `0px` on both sides, never painted | closed — no rendered difference |
| F-4 | review gate (PR #691) | Two doc-staleness findings: `booking-dialog.contrast.spec.ts` + `home.contrast.spec.ts` headers still pointed at the deleted/reduced SCSS as what their tables mirror; repointed at the inline template / `home.html` utilities. The gate ran via the code-review skill (invocation-ladder rung 1) with `riviera-review-overlay`; single-pass inline (no subagent fan-out available in-session), declared in the PR. Zero correctness/a11y/invariant findings | fixed in the close-out commit of PR #691 |
| F-5 | sonar gate (PR #691) | Quality Gate passed; API-verified lists: 0 new issues, 0 hotspots, 0.0% duplication, 100% coverage on new code | closed |
| F-3 | Phase-3 diff | step-2 snapshot caught `.btn-primary` `filter` mid hover-transition (`brightness(1)` vs `1.06`) — a capture-timing race: the pointer rests on the button after the Continue click on both sides; the settled 400ms hover probe reads `brightness(1.06)` with `transition: filter 0.15s` identically before and after | closed — capture artifact, not drift |

---

## File structure

- `docs/plans/scss-tailwind-home-booking-dialog.md` — this plan.
- `frontend/src/app/pages/home/home.html` — utilities beside the retained marker classes.
- `frontend/src/app/pages/home/home.ts` — host class (`block text-(--riv-card-ink)`), `appFieldGlass` import.
- `frontend/src/app/pages/home/home.scss` — reduced to the scrim holdout + header justification.
- `frontend/src/app/booking/booking-dialog.ts` — utilities in the inline template + host class; `styleUrl` removed; `appFieldGlass` import.
- `frontend/src/app/booking/booking-dialog.scss` — deleted.
- `.claude/skills/riviera-tailwind/SKILL.md` — remaining-SCSS inventory refreshed (10→9 files, 6→5 in `booking/`; docs-freshness finding).
- `frontend/src/app/booking/booking-dialog.contrast.spec.ts` — header repointed at the inline template (review finding F-4; assertions untouched).
- `frontend/src/app/pages/home/home.contrast.spec.ts` — header + geometry comment repointed at `home.html`/`styles.scss` (review finding F-4; assertions untouched).

(The baseline scratch spec lives behind `.git/info/exclude` and is never committed.)

---

## Phase 0 — Computed-style baseline (the "red" of this slice)

**Files:** scratch only (`frontend/e2e/style-baseline.e2e.ts`, excluded from git)

- [x] **Step 1:** Write a Playwright spec against the mocked suite config that, for each
  themed surface (Discover in riviera + porcelain; the booking dialog steps 1, 2 and the
  error state), dumps `getComputedStyle` (all properties) for every styled selector of the
  two components into JSON under the session scratchpad, plus state probes: li-hover card
  `transform`/`box-shadow`/`border-color`, keyboard `:focus-visible` outlines on a filter
  control and the dialog buttons, hover `filter`/`background` on close/back/primary.
- [x] **Step 2:** Run it on the **unmodified** tree → `baseline.json`.
- [x] **Step 3:** Commit nothing (spec is git-excluded). Dump: 144 entries, 0 missing selectors, under the session scratchpad (`style-baseline/before.json`).

## Phase 1 — Migrate `home`

**Files:** Modify `home.html`, `home.ts`, `home.scss`

- [x] **Step 1:** Port every `home.scss` rule except the `:host-context` scrim to utilities
  in `home.html` (markers retained), `:host` display/color to the component `host` class.
- [x] **Step 2:** Reduce `home.scss` to the scrim rule with the holdout justification as
  the file header; keep the `.hero` base padding in the template (theme-shared layout).
- [x] **Step 3:** Adopt `appFieldGlass` on the three filter controls.
- [x] **Step 4:** `npm test -- pages/home` scope + re-run the baseline spec → diff clean.
- [x] **Step 5:** Commit.

## Phase 2 — Migrate `booking-dialog`

**Files:** Modify `booking-dialog.ts` · Delete `booking-dialog.scss`

- [x] **Step 1:** Port every rule to the inline template; host styles to the `host` class
  string; `riv-pop`/hover/focus/motion-reduce per the ledger; delete `styleUrl` + SCSS.
- [x] **Step 2:** Adopt `appFieldGlass` on the three dialog inputs.
- [x] **Step 3:** Unit scope + baseline re-run → diff clean.
- [x] **Step 4:** Commit.

## Phase 3 — Verification

- [x] **Step 1:** Full baseline diff (both components, all states) → 3 residual deltas, all benign (Findings F-1..F-3); the normalized diff is otherwise empty.
- [x] **Step 2:** `npm run lint`, `npm run format:check`, `npm test`, `npm run build`,
  `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y`.
- [x] **Step 3:** `node scripts/check-plan-file-structure.mjs --diff origin/main` (plan doc staged).
- [x] **Step 4:** Update execution status; commit; push.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** baseline diff benign-only — F-1..F-3 in the Findings register. Verified at the migration commit of this branch.
- [x] **AC-2/AC-3/AC-4:** `npm test` 161 files / 1454 tests green; mocked e2e 217/217 green; zero spec edits. Verified at the migration commit of this branch.
- [x] **AC-5:** `booking-dialog.scss` deleted; `home.scss` = scrim holdout + header justification only. Verified at the migration commit of this branch.

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
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing merged via PR #691.
- [x] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 (rung 1: the code-review skill executed, medium effort; single-pass inline — the caveat is declared in the PR) *plus* `riviera-review-overlay` (frontend bank; findings F-4 fixed).
