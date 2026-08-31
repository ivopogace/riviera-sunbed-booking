# SCSS→Tailwind: operator-console shell chrome Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Retire `operator/operator-console.scss` (259 lines → deleted) by porting every
live rule to Tailwind utilities, with zero computed-style drift proven by a real-browser
before/after diff — the recorded follow-up of #694's maintainer-approved deferral.

**Architecture:** Styling-only migration under `riviera-tailwind`'s migrate-on-touch rule.
The one significant discovery shaping scope: roughly 45 lines of the SCSS are **dead** —
the signed-out sign-in form (`.oc-field`, `.oc-signin-btn`, `.oc-form-error` and their
hover/reduced-motion guards) was removed from the template when `operatorSessionGuard`
took over the gate (S9 #277); the signed-out branch today is only the "Venue not found"
card. Dead rules are dropped, not ported (grep evidence in the parity ledger). The live
chrome maps 1:1 onto two shipped Tailwind exemplars: `operator/operator-chrome.ts`
(sticky glass header, header links, sign-out button — the console footer in the same
template already uses the identical glass utilities) and `admin/admin-console-tabs.ts`
(pill tabs styled via `routerLinkActive` utility strings). No new shared directives:
nothing here repeats outside this component that isn't already a directive.

**Persistence:** N/A — frontend-only; no tables or migrations touched (invariant #1 not in scope).

**Source of intent:** GitHub issue #698 (deferred migrate-on-touch follow-up from #694;
see `docs/plans/pending-operator-console.md`).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — the grill
found the dead sign-in-form rules, that **no spec queries any `.oc-*` class** — all hooks
are `data-testid` — and that the only open PRs are Dependabot bumps, no overlap) ·
`riviera-plan-doc` (this template — forced the parity ledger below, which is where the
dead-rule drops and the two deliberate posture changes are argued) · `tdd` (adapted: the
red/green is the computed-style baseline diff — captured BEFORE the migration, re-diffed
after) · `riviera-review-overlay` (review gate — ran at ready-for-review as the code-review
skill's 5-agent fan-out + the frontend bank, findings F-2/F-3; RV-FE-7 discharged) · `riviera-docs-freshness` (ran over this slice's diff —
1 finding: the `riviera-tailwind` SKILL.md remaining-SCSS inventory goes stale, 9→8 files;
patched in this slice) · `riviera-tailwind` (migration checklist + idioms:
`bg-(image:--riv-bg)` for the gradient var — bare `bg-(--x)` is a color — `text-[14px]`
not `text-sm`, inert markers, no `@apply`, `hover:` gating, the touch-target rule) ·
`riviera-frontend` (placement: no new files beyond this plan doc; confirmed the exemplars
and that the console's porcelain subtree pinning stays a host attribute) ·
`riviera-local-debug` (cloud recipes: mocked e2e via
`PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium`, never `playwright install`) ·
`playwright-cli` (loaded at Phase 0 for the scratch baseline spec; no new committed specs —
the existing mocked suites already pin the console). `angular-developer` + angular-cli MCP:
N/A — no logic, template control-flow, or API edits; class attributes and the component
`host` metadata only (the #679/#691 precedent for a styling-only migration).

**Branch:** `claude/sdlc-698-pjusfi` (session-designated; the `<feature>/<slug>`
convention is overridden by the remote-session branch mandate).

---

## Acceptance criteria (testable)

> Styling-only slice: the pins are (a) the already-shipped spec suites staying green,
> and (b) a one-time computed-style diff recorded in this plan doc. New permanent test
> classes would duplicate what the contrast/e2e/touch-target suites already pin.

- [x] **AC-1:** Given the pre-migration baseline dump of `getComputedStyle` for every
  styled element of the console shell (signed-in header/tabs/badge/main/footer with an
  active tab and a Requests badge, plus the venue-not-found card), when the same dump
  runs post-migration, then the diff is empty apart from deltas argued benign in the
  Findings register. *Pinned by:* the Phase-2 diff procedure below (scratch spec, not
  committed).
- [x] **AC-2:** Given the migration, when `npm test` runs, then
  `operator-console.spec.ts`, `operator-console.a11y.spec.ts` and
  `operator-console.contrast.spec.ts` pass — the contrast spec stays green with every
  live-surface assertion untouched; only the two rows asserting the **dead** sign-in
  form's colors (CTA-gradient submit, form-error ink) are removed with the dead rules
  they mirrored, and the spec header is repointed at the template (the #691 F-4
  precedent). *Pinned by:* those existing specs.
- [x] **AC-3:** Given the migration, when the mocked e2e suite runs, then
  `touch-targets.e2e.ts` (the console sweep — measures every rendered control box),
  `operator-onboarding.e2e.ts`, `operator-daily.e2e.ts`, `operator-pricing.e2e.ts`,
  `operator-venue.e2e.ts`, `operator-payouts.e2e.ts` and the rest of the suite pass
  unmodified. *Pinned by:* those existing suites.
- [x] **AC-4:** Given the migration, when `git grep "styleUrl" frontend/src/app/operator/operator-console.ts`
  runs, then nothing matches and `operator-console.scss` is deleted. *Pinned by:* code
  review (RV-FE-7).
- [x] **AC-5:** Given the header links and tabs, when the touch-target declaration is
  checked, then each interactive control carries `[appTouchTarget]` (replacing the SCSS's
  hand-tuned `min-height: 44px`), the in-sentence "create a venue" link keeps its rendered
  box, and `node scripts/check-touch-target.mjs --files frontend/src/app/operator/operator-console.html`
  passes. *Pinned by:* that guard + the `touch-targets.e2e.ts` measured sweep.

## Non-goals

- The other seven legacy SCSS files (`app.scss`, `auth.scss`, `booking-confirmation.scss`,
  `booking-pay.scss`, `find-booking.scss`, `my-bookings.scss`, `request-confirmation.scss`)
  — each migrates when its component is next touched (`home.scss` is the documented scrim
  holdout, not legacy).
- Any restyle, token change, or design tweak — the rendered pixels must not move.
- No new shared directives — the glass/header recipes this shell uses are single-consumer
  here or already live as utilities in sibling exemplars.
- No logic/template-control-flow edits: `operator-console.ts` behavior, testids, ARIA and
  routes are untouched (the parity ledger verifies style-carried behavior only).
- Not fixing the pre-existing stale `oc-signin-title` testid assertion in
  `operator-console.spec.ts:152` (queries a testid that never existed; passes vacuously —
  out of a styling slice's scope).

## Behavior-parity ledger (retirement / replacement slices only)

> Restyle slice → mandatory. TS logic, template control flow, ARIA and testids are
> untouched; the rows below are the *style-carried* behaviors that could silently drop.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Host paints the full-viewport porcelain gradient (`background: var(--riv-bg)` — an image var) + base ink + `--riv-font` family, `display:block; min-height:100%` | preserved | component `host` class: `block min-h-full bg-(image:--riv-bg) text-(--riv-ink) [font-family:var(--riv-font),sans-serif]` — the `image:` form is mandatory (bare `bg-(--x)` emits background-*color*); the `data-riv-theme="porcelain"` host attribute is untouched |
| Sticky header above content (`z-index:20`) with porcelain glass (`--riv-header-glass` + 22px blur / 170% saturate + bottom border) | preserved | `sticky top-0 z-20 border-b border-b-(--riv-header-border) bg-(--riv-header-glass) backdrop-blur-[22px] backdrop-saturate-[1.7]` — the `operator-chrome.ts`/footer treatment, except the border color is **side-scoped** (`border-b-(…)`) as F-1's one exact twin, so the unpainted sides keep their currentColor exactly as the SCSS left them. (Corrected at review F-2 — an earlier draft claimed byte-identity.) |
| Header/tab/main content column: `max-width:1120px`, centered, fixed paddings; header row wraps | preserved | `mx-auto max-w-[1120px]` + per-surface padding utilities; `flex flex-wrap items-center justify-between gap-4` |
| `box-sizing: border-box` on `.oc-tabs`/`.oc-main` | dropped | redundant — Tailwind preflight sets `border-box` globally; computed value identical |
| Header links (`Create a venue`, `Admin`, `Change password`): 13px semibold ink, no underline, `hover:` underline; `display:inline-flex; align-items:center; min-height:44px` (the SCSS's own comment: inline min-height is a no-op) | changed | `appTouchTarget` + `inline-flex items-center text-[13px] font-semibold text-(--riv-ink) no-underline hover:underline` — exactly `operator-chrome.ts`'s links. Two deliberate deltas: (a) `appTouchTarget` adds `min-w-11`, declaring the floor on **both** axes (rule 4; every link's text box already exceeds 44px width, so rendered boxes are unchanged — the e2e sweep measures); (b) plain SCSS `:hover` becomes v4 `hover:`, gated under `(hover:hover)` — hover styling never applied on touch-only devices anyway except via sticky tap-hover, and the gated form is the repo-wide shipped posture |
| In-sentence "create a venue" link in the venue-not-found card (same `.oc-create-venue` class) | preserved | same utilities minus the directive: `inline-flex items-center min-h-11` keeps the computed box identical; as an inline-prose link it is 2.5.5's own exception, and the guard ignores `<a>` by design — no `data-touch-exempt` needed since the box still meets the floor. The review gate raised #605 phase-4's convergence (in-sentence links carry `data-touch-exempt`, never a hand-rolled half floor) — not taken here because dropping the `min-h-11` would shrink the rendered line box, i.e. exactly the drift this slice forbids; parity with the shipped SCSS wins inside a no-drift slice (review F-3, no code change) |
| Signed-in-as line: 13px soft ink, `strong` in full ink | preserved | utilities on the span + `<strong class="text-(--riv-ink)">` (the SCSS reached the `strong` anonymously; `operator-chrome.ts` precedent) |
| Wordmark 19px/700/-0.01em + soft "Operator" span; brand column `line-height:1.15`; venue title 10px/600/0.2em uppercase faint ink, 4px top margin | preserved | utilities per element (`text-[19px] font-bold tracking-[-0.01em]`, `leading-[1.15]`, `mt-1 text-[10px] font-semibold tracking-[0.2em] uppercase text-(--riv-ink-faint)`) |
| Pill tabs: 13.5px semibold soft ink, transparent bg + transparent 1px border, `border-radius:999px`, `padding:8px 15px`, `gap:7px`, `min-height:44px`; hover → full ink | changed | base utilities on the `<a>` (`rounded-full`, `hover:text-(--riv-ink)`) + `appTouchTarget` — same two deliberate deltas as the header links (min-width floor, `(hover:hover)` gating), same argument |
| Active tab: opaque white pill, dark ink, hairline border `rgba(12,42,51,0.1)`, `0 2px 8px` shadow (the css:S7924 solid-fill treatment), via `routerLinkActive="oc-tab--active"` | preserved | `routerLinkActive` carries only the `oc-tab--active` marker; the active styling lives in `[&.oc-tab--active]:` arbitrary variants on the base class string — a deliberate deviation from `admin-console-tabs.ts` (which puts competing same-property utilities in the `routerLinkActive` string, a latent stylesheet-order coin flip this shape avoids: two classes beat one deterministically). `ariaCurrentWhenActive="page"` untouched. (Corrected at review F-2.) |
| Requests badge: white 11.5px/700 on solid `#0a5f74`, `min-width:20px`, 20px tall, `line-height:1`, pill | preserved | `inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-[#0a5f74] px-1.5 text-[11.5px] font-bold leading-none text-white` |
| Venue-not-found card: 440px white card, 22px radius, hairline border, `0 20px 50px` shadow, 24px/700 title, 14px/1.55 soft intro | preserved | utilities on the card/heading/paragraph; the white-card ink pairs stay pinned by the contrast spec's live rows |
| Signed-out sign-in **form** styling: `.oc-field` (+ nested `input`), `.oc-signin-btn` (+ `(hover:hover)` brighten + reduced-motion guard), `.oc-form-error` | dropped | dead since S9 #277 moved the gate into `operatorSessionGuard` — the template has no form (`grep -rn "oc-field\|oc-signin-btn\|oc-form-error" frontend/src frontend/e2e` matches only the SCSS). The two contrast rows mirroring these colors go with them; the CTA-gradient stops remain pinned by the tourist-surface contrast specs that own them |
| Shell column `min-height:100vh`, `.oc-main` flex-grows | preserved | `flex min-h-screen flex-col` on the shell, `flex-1` + width/padding utilities on `<main>` |
| Semantic `.oc-*` class names | preserved as inert markers | retained beside the utilities for readability/log-greppability even though no spec queries them (grill finding); `oc-tab-label` was already style-less |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Silent computed-style drift (a dropped `cursor`, a wrong shadow, a lost `letter-spacing`) | med | high | Full-surface `getComputedStyle` baseline diff (Phase 0 vs Phase 2): signed-in shell with active tab + badge, venue-not-found card, hover/focus probes on a header link and a tab | agent | closed — residuals are the three benign classes (F-1); probes + boxes byte-identical |
| R-2 | The two deliberate posture deltas (`hover:` gating, `min-w-11`) read as drift in the diff | high | low | Pre-argued in the parity ledger; the diff normalizes them as documented-benign; single-state renders are identical | agent | closed — F-1: min-width is the only computed delta; rendered boxes identical |
| R-3 | Angular emulated encapsulation: SCSS rules carried `[_ngcontent]` specificity, utilities are global single-class — a global rule that previously lost could now win | low | med | The migrated properties are element-local (no global rules target `.oc-*`; checked `styles.scss`/`app.scss`); the baseline diff would catch any flip | agent | closed — diff clean |
| R-4 | Tailwind representation deltas (`rounded-full` → `calc(infinity*1px)`, `--tw-*` var enumeration, shadow placeholder layers) | high | low | Known-benign class from #691 F-1; normalize in the diff, mirror exact twins where cheap | agent | closed — F-1; the header border color side-scoped as the one cheap exact twin |
| R-5 | Hygiene guards fire on the touched files (inline comments, TT-1/TT-2 touch-target declaration, plan-doc file structure) | med | low | One-line comments only; `appTouchTarget` on every `<button>`/interactive control the guard scopes; run all three guards + `check-plan-file-structure.mjs --diff origin/main` before pushing | agent | closed — all four guards exit 0 on the diff |
| R-6 | Pruning the two dead-form contrast rows read as "retuning a test to match" at review | med | med | Only rows mirroring **deleted dead** rules are removed, argued here + in the ledger; every live-surface assertion is untouched; #691 F-4 is the header-repoint precedent | agent | closed — review gate ruled the removal legitimate: grep-verified the form was dead SCSS all along (no template form even at the oldest reachable commit), and both pruned color sets stay pinned by 5+ other live contrast specs |
| R-7 | `host` class merge: adding a `class` key to a `host` object that already carries `data-riv-theme` could collide with encapsulation attributes | low | low | Host `class` metadata is additive in Angular; the porcelain attribute stays; a11y/unit specs + baseline diff confirm | agent | closed — specs green; diff clean |

## Open questions / Assumptions

None open.

### Resolved

- **Assumption:** pruning the two dead-form contrast rows (with header repoint) satisfies
  AC "the existing operator-console.contrast.spec.ts stays green". — Resolved at the
  review gate (R-6 closed): three independent review agents verified the form was dead
  SCSS all along and both pruned color sets remain pinned by 5+ other live contrast
  specs; no coverage lost. Recorded in the review-fix commit of this branch.

## Availability & concurrency (invariant #2)

N/A — styling-only; no availability read/write path, no booking lifecycle logic touched.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/operator-console.html` + `operator-console.ts` (host class; `styleUrl` removed) + `operator-console.scss` (deleted) | existing | standalone component | unchanged (signals) | N/A |

**Standards:** no logic edits; class attributes, `routerLinkActive` strings and the
component `host` metadata only. `TouchTarget` is already imported (the sign-out button
uses it); the header links/tabs adopt it. No deviations.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** merge close-out — merged via PR #699

**Next action:** none — slice complete (post-merge items are GitHub-only: issue #698
auto-closes via the PR; no parent epic)

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — computed-style baseline | ✅ | (scratch only, git-excluded; dump: 21 shell + 6 not-found selectors, 0 missing; hover probes + rendered boxes all ≥44px) |
| 1 — migrate the console chrome | ✅ | this branch (scoped: 4 spec files / 49 tests green; touch-target guard green; diff residuals = the three pre-argued benign classes, F-1) |
| 2 — diff + full frontend gate + docs freshness | ✅ | this branch (lint/format green — the sole Prettier warn is the git-excluded scratch spec; 164 files / 1466 unit tests; build green; mocked e2e 219/219; all four diff guards green; SKILL.md inventory 9→8) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-2 | review gate (PR #699) | The gate ran as the code-review skill's 5-agent fan-out + `riviera-review-overlay` (frontend bank; every RV-FE-* item walked — no Blockers/Majors). Two real Minors, both plan-doc accuracy: the parity ledger's active-tab row described the `admin-console-tabs.ts` mechanism instead of the shipped `[&.oc-tab--active]:` arbitrary variants, and its sticky-header row claimed byte-identity while F-1 records the deliberate side-scoped border — both ledger rows corrected. Advisory items: the in-sentence link's hand-rolled `min-h-11` vs #605's `data-touch-exempt` convergence (kept — no-drift wins; ledger row expanded, F-3), a dedup suggestion for the repeated link utility string (declined — matches the shipped `operator-chrome.ts` precedent, no `@apply`/SCSS sharing involved), and one false positive (a `styles.scss` comment allegedly citing a missing spec — `home.contrast.spec.ts:211` has the case). Review verdicts also closed R-6 | fixed in the review-fix commit of this branch |
| F-3 | review gate (PR #699) | Contrast-spec hardening from the comment-guidance walk: the spec header's "mirror" pointer now names all three sources (template utilities, the host class in `operator-console.ts`, the porcelain tokens in `styles.scss`), and the one live text pair without an assertion — sign-out's `hover:bg-[#eef1f2]` under full ink, a gap that predates this slice — gets its row, discharging the deleted SCSS header's "every text pair proven" promise | fixed in the review-fix commit of this branch |
| F-4 | sonar gate (PR #699) | Quality Gate passed on the migration head; API-verified (not just the badge): 68 new lines analyzed, 0 issues, 0 hotspots, 0.0% duplication, 0 new bugs/vulnerabilities/smells. Coverage-on-new-code 0.0% is the styling-only shape (class attributes carry no executable lines). Re-verified after the review-fix push | closed |
| F-1 | Phase-1/2 diff | Residual computed-style deltas, all in three pre-argued benign classes: (a) `--tw-*` theme/utility custom props now enumerate in computed style; (b) `rounded-full` computes `calc(infinity*1px)` where SCSS said `999px` (both clamp to the half-box; the badge/tab rendered radii are identical) and `box-shadow` carries fully-transparent zero-size placeholder layers from the var chain; (c) `min-width: auto → 44px` on the header links/tabs from `appTouchTarget`'s `min-w-11` — the deliberate both-axes floor (parity ledger), rendered boxes byte-identical per the probe. One would-be delta pre-empted by the exact-twin norm: the header's border color is side-scoped (`border-b-(--riv-header-border)`) so the unpainted sides keep their currentColor | closed — no rendered difference (probes + boxes byte-identical) |

---

## File structure

- `docs/plans/scss-tailwind-operator-console.md` — this plan.
- `frontend/src/app/operator/operator-console.html` — utilities beside the retained marker classes.
- `frontend/src/app/operator/operator-console.ts` — host `class` added; `styleUrl` removed.
- `frontend/src/app/operator/operator-console.scss` — deleted.
- `frontend/src/app/operator/operator-console.contrast.spec.ts` — header repointed at the template; the two dead-form rows removed; live assertions untouched.
- `frontend/src/app/operator/operator-console.a11y.spec.ts` — stale docstring ("signed-out sign-in card") corrected to the venue-not-found card; assertions untouched.
- `.claude/skills/riviera-tailwind/SKILL.md` — remaining-SCSS inventory refreshed (9→8 files; docs-freshness finding).

(The baseline scratch spec lives behind `.git/info/exclude` and is never committed.)

---

## Phase 0 — Computed-style baseline (the "red" of this slice)

**Files:** scratch only (`frontend/e2e/style-baseline.e2e.ts`, excluded from git)

- [x] **Step 1:** Load `playwright-cli`. Write a Playwright spec against the mocked suite
  config that mounts the console (`mockWholeConsole` + `signInAsOperator` from
  `e2e/support/operator-console.mocks`), navigates to a tab route, and dumps
  `getComputedStyle` (all properties) for every styled selector of the shell — host,
  header (+inner, brand, wordmark, op-span, venue title, right cluster, the three links,
  signed-in-as + strong, sign-out button), tabs (inactive + active + label), badge, main,
  footer — plus the venue-not-found card (host, card, title, intro, in-sentence link) via
  an invalid-venue route, plus state probes: hover on a header link (`text-decoration`)
  and an inactive tab (`color`).
- [x] **Step 2:** Run it on the **unmodified** tree → `before.json` under the session
  scratchpad. Record entry count + zero missing selectors here.
- [x] **Step 3:** Update plan-doc execution status (commit the plan doc; scratch spec
  stays excluded). Open the draft PR (the CI vehicle — no CI without a PR).

## Phase 1 — Migrate the console chrome

**Files:** Modify `operator-console.html`, `operator-console.ts`,
`operator-console.contrast.spec.ts`, `operator-console.a11y.spec.ts` · Delete
`operator-console.scss`

- [x] **Step 1:** Port every live rule per the parity ledger: utilities in
  `operator-console.html` (markers retained), `:host` display/background/ink/font to the
  component `host` class, active-tab utilities into the `routerLinkActive` string,
  `appTouchTarget` on the three header links and the tabs. Delete `styleUrl` + the SCSS.
- [x] **Step 2:** Contrast spec: repoint the header at the template; remove the two
  dead-form rows. A11y spec: correct the stale docstring.
- [x] **Step 3:** Scoped verify: `npm test -- operator-console` (unit + a11y + contrast)
  and `node scripts/check-touch-target.mjs --files frontend/src/app/operator/operator-console.html`.
- [x] **Step 4:** Commit; update execution status in the same commit window.

## Phase 2 — Verification

- [x] **Step 1:** Re-run the baseline spec → `after.json`; diff against `before.json`;
  argue every residual delta benign in the Findings register or fix it. Never retune a
  test or the dump to match a regression.
- [x] **Step 2:** `npm run lint`, `npm run format:check`, `npm test`, `npm run build`,
  `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y`.
- [x] **Step 3:** Refresh the `riviera-tailwind` SKILL.md remaining-SCSS inventory
  (9→8; `riviera-docs-freshness` sweep over the slice diff for anything else the deletion
  invalidates).
- [x] **Step 4:** `node scripts/check-plan-file-structure.mjs --diff origin/main` (plan
  doc staged) + the inline-comments and focus-posture guards on the diff.
- [x] **Step 5:** Update execution status; commit; push; merge latest `origin/main`;
  mark the PR ready for review → run the Review + Sonar gates per
  `references/pr-gates.md`.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** baseline diff benign-only — recorded in the Findings register.
- [x] **AC-2:** `npm test` green; contrast spec live rows untouched.
- [x] **AC-3:** mocked e2e suite green, zero spec edits.
- [x] **AC-4:** `git grep "styleUrl" frontend/src/app/operator/operator-console.ts` → no match; SCSS deleted.
- [x] **AC-5:** touch-target guard green on the template; `touch-targets.e2e.ts` sweep green.

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
- [x] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing `merged via PR #NN`.
- [x] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone.
