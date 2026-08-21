# Loading Announcements: One Persistent Live Region Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Every loading state in the app announces to assistive tech through a live region
that is **already in the DOM when its text changes** — so the loading→loaded transition is
actually spoken — replacing the eight regions that are born holding their text and removed
wholesale (which most screen-reader/browser combinations never announce).

**Architecture:** One shared presentational primitive, `shared/load-announcer.ts`
(`app-load-announcer`), renders a **persistent** `sr-only` `role="status" aria-live="polite"`
paragraph whose text is a `computed()` over the call site's phase. Call sites place it
**outside** their loading/loaded `@if` chain, so the element survives the transition and only
its text content mutates — the shape `booking/booking-pay.ts`'s `pay-status` region already
documents, and the same rule #717/#718 applied to the *content* regions ("Only the CONTENT
branches: a rebuilt aria-live region announces unreliably"). The loading surfaces are the
ones that never got it. The now-redundant visible/skeleton loading markup becomes
`aria-hidden="true"`, so the announcement has exactly one source.

**Persistence:** JDBC only (invariant #1). N/A — frontend-only; no tables, no migrations.

**Source of intent:** GitHub issue #741 (deferred review finding F-4 from PR #740 / issue
#739, recorded in `docs/plans/shell-booking-scss-migration.md`).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — the gate is what
turned this from a 3-surface ticket into an 8-surface one, and caught that the count regions on
`venue-map` and `daily-view-tab` sit **inside** their loaded branch, so unlike Discover's they do
**not** announce completion) · `riviera-plan-doc` (this template — forced the Behavior-parity
ledger, which is what surfaced the false-"loaded"-on-error defect the naive two-state API would
have shipped) · `tdd` (each surface's persistence assertion goes red before the markup moves;
the primitive is built red-green-refactor) · `riviera-review-overlay` (review gate — at
ready-for-review; RV-FE-E2E decided the new spec belongs in the CI-run mocked suite) ·
`riviera-docs-freshness` (due over this slice: no substrate doc states a live-region rule today
— `grep -rn 'aria-live' .claude/skills docs --include=*.md` returns nothing outside `docs/plans/`
— so the decision this slice makes needs a home; adding **RV-FE-10** to the review overlay's
frontend conventions is that home) · `riviera-frontend` (placement: the primitive is pure,
stateless and presentational → `shared/`, not `core/`; no new cross-feature edge) ·
`angular-developer` + **angular-cli MCP** (`get_best_practices`: `input()`/`computed()`, host
object over `@HostBinding`, no explicit `standalone`/`OnPush`; **`search_documentation` is what
settled the option-1-vs-option-2 fork** — angular.dev's `@defer` a11y guidance states screen
readers "may not announce changes when the deferred content loads" and prescribes a live region
that **wraps** the transition, which is option 2. Its literal example puts `aria-atomic="true"`
on a wrapper around the content; adapted here to the sibling `pay-status` shape because wrapping
a venue grid in a live region would announce the whole grid. Its second pointer, CDK
`LiveAnnouncer`, is unavailable — `@angular/cdk` is not a dependency and one utility does not
justify adding it) · `riviera-tailwind` (the primitive supplies markup, so rule 1 puts it on the
"reused *element*" branch: element selector + `class: 'contents'` host, per `app-clock-icon`, not
an attribute directive; existing `data-testid`s retained as inert markers per rule 2) ·
`playwright-cli` (the mocked-suite spec that proves persistence in a real browser, which jsdom's
change-detection timing cannot) · `riviera-local-debug` (scoped test runs; cloud Chromium via
`PW_CHROMIUM_EXECUTABLE`).

**Branch:** `claude/sdlc-741-4966yh` — the session's designated remote branch stands in for
`bugfix/loading-announcements` (riviera-sdlc cloud addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given `app-load-announcer` with `loading` true, when `loading` flips to false,
  then **the same DOM element** carries the text (identity preserved across the transition —
  asserted by holding an element reference across change detection, not by re-querying), its
  text becomes `readyLabel`, and it is `sr-only` + `role="status"` + `aria-live="polite"`.
  *Pinned by:* `shared/load-announcer.spec.ts`.
- [ ] **AC-2:** Given `app-load-announcer` with `failed` true and `loading` false, when it
  renders, then its text is empty — a failed load never announces "loaded". *Pinned by:*
  `shared/load-announcer.spec.ts`.
- [ ] **AC-3:** Given each of the eight surfaces below, when the component renders in its
  **loaded** state, then an `app-load-announcer` region is present in the DOM (it is not
  scoped to the loading branch), and no loading container carries `aria-live` any more.
  *Pinned by:* one assertion per surface in that surface's existing spec.
- [ ] **AC-4:** Given each of the eight surfaces, when it transitions loading→loaded, then the
  announcer element captured while loading is the **same node** after loading, with mutated
  text. *Pinned by:* the same eight specs.
- [ ] **AC-5:** Given every loading surface, when it is loading, then the visible skeleton or
  visible "Loading…" paragraph is `aria-hidden="true"` — the announcer is the single source of
  the announcement. *Pinned by:* the eight specs.
- [ ] **AC-6:** Given Discover in a real browser with a delayed venues response, when the list
  lands, then `[data-testid="load-announcer"]` was present both before and after, and its text
  changed from "Loading venues…". *Pinned by:* `frontend/e2e/loading-announcements.e2e.ts`
  (mocked suite, CI-run).
- [ ] **AC-7:** Given the whole change, when `npm run lint`, `npm run format:check`,
  `npm test` and `npm run test:e2e:a11y` run, then all pass, and every pre-existing spec passes
  **unmodified** except the announcement assertions this slice deliberately changes.

---

## Non-goals

- **Failure announcements.** No surface's failure panel is a live region today
  (`shared/failure-panel.ts` has no `role="alert"`), so a failed load is silent. This slice only
  ensures the announcer does not *lie* ("loaded") on failure; making failure audible is a
  separate defect → follow-up issue at close-out.
- **The result/notice regions** (`<output>` elements, admin notices, `booking-view`'s
  withdraw/cancel results). Some share the born-with-text shape, but they are result
  announcements, not loading ones, and several are already correct. Out of scope.
- **`aria-busy`.** Considered and rejected: it is a hint about a region being updated, not an
  announcement mechanism, and adding it would not change what is spoken. The per-row
  `aria-busy` on my-bookings (a known booking still resolving inside a real list) stays as is.
- Adding `@angular/cdk` for `LiveAnnouncer`.

---

## Behavior-parity ledger

The old surface is "a loading container that is itself the live region". Behaviors:

| # | Old behavior | Verdict |
|---|---|---|
| B-1 | Loading text present in the DOM for AT to encounter on traversal | **preserved** — moves to the announcer, still `sr-only` (or still visible, now `aria-hidden`) |
| B-2 | Loading text *announced* on insertion | **changed** — it never actually worked (the defect); now the loading→loaded transition announces instead |
| B-3 | Skeleton/visible loading markup is decorative | **preserved** — `aria-hidden` moves to the container |
| B-4 | `data-testid` hooks (`loading`, `set-loading`, `my-bookings-loading`, `requests-loading`, `payouts-loading`) | **preserved** — retained as inert markers (`riviera-tailwind` rule 2), so no unrelated spec churn |
| B-5 | On a failed load the region simply vanished (silent) | **preserved deliberately** — the announcer is empty on failure rather than announcing "loaded"; failure audibility is a Non-goal |
| B-6 | my-bookings per-row `aria-busy="true"` | **preserved** — untouched |
| B-7 | Discover's persistent results-count region announces the count on load | **preserved** — which is exactly why Discover's `readyLabel` is empty: one source per sentence |

---

## Risk register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | Inserting a persistent element at the top of a template shifts `:first-child`/`nth-child`/`first:` styling | Medium | Visual regression | Host is `class: 'contents'` and the inner `<p>` is `sr-only` (absolutely positioned → out of flow, not a flex/grid item). Grep each touched template for `first:`/`nth-child`/`:first-child` before placing; the mocked e2e's axe+render pass is the backstop |
| R-2 | Double announcement where a persistent count region already speaks (Discover) | Medium | Noisy AT | Discover's `readyLabel` is empty by design (B-7). Verified per surface in the adoption table below |
| R-3 | `readyLabel` derived from a live count would re-announce on every later mutation (date change, accepting a request) | Medium | Noisy AT | `readyLabel` is a **static string** per call site, never a computed count |
| R-4 | The announcer announces "loaded" when the load failed | High if unguarded | Wrong information to AT | `failed` input suppresses the ready label (AC-2) |
| R-5 | jsdom cannot prove a real screen reader announces | Certain | False confidence | Specs assert the *mechanism* (element identity preserved across the transition), which is the falsifiable part; the e2e proves it in a real browser. Specs must not claim "announced" as a proven fact — the wording defect #741 called out |
| R-6 | Eight surfaces adopted mechanically, one signal mapped wrong (e.g. a surface whose "loaded" is also its error state) | Medium | Silent or wrong announcement | Each surface's `loading`/`failed` expression is derived from a named `computed()` in the component, not template logic, and asserted per surface (AC-3/AC-4) |

---

## Open questions / Assumptions

- **A-1 (assumption):** Announcing the *completion* is the valuable half; the initial-mount
  "Loading…" text may still go unspoken because the component mounts already loading. This
  matches angular.dev's own framing ("screen readers that focus on a deferred section will
  initially read the placeholder … but may not announce changes when the deferred content
  loads"). A deferred first write to force the initial announcement was considered and
  rejected as untestable timing hackery. **Re-loads** (filter change, date change, retry) do
  announce "Loading…" because the region is already mounted.
- **A-2 (assumption):** Static ready sentences ("Beach map loaded.") over live counts — R-3.

### Resolved

- **Q-1 — option 1 (drop the claim) or option 2 (persistent region)?** Resolved at plan time
  in favour of option 2, on angular.dev's `@defer` accessibility guidance retrieved via the
  angular-cli MCP; the maintainer asked for that evidence before choosing. See *Skills
  consulted*.
- **Q-2 — three surfaces or all eight?** Resolved by the maintainer: **all eight**, matching
  the repo's #735/#737 precedent of fixing a defect class rather than its named instances.

---

## Availability & concurrency (invariant #2)

N/A — no booking, availability, or beach-map *state* is read or written. The beach map is
touched only as a rendering surface (its loading paragraph).

## Spring Modulith — modules, interfaces, events

N/A — frontend-only slice. No backend module, port, event, or `RESPONSIBILITIES.md` contract
is touched.

### Module ownership (§4a)

N/A — no backend behavior added or moved.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no money is read, rendered, or moved. `booking-pay.ts` is read as the **precedent** for
the region shape but is not modified.

---

## Angular — frontend surfaces touched

**New primitive:** `shared/load-announcer.ts` — `app-load-announcer`, `host: { class: 'contents' }`,
template a single `<p class="sr-only" role="status" aria-live="polite" data-testid="load-announcer">{{ message() }}</p>`.

API: `loading = input.required<boolean>()` · `failed = input(false)` ·
`loadingLabel = input.required<string>()` · `readyLabel = input('')`;
`message = computed(() => loading() ? loadingLabel() : failed() ? '' : readyLabel())`.

**The eight adoption sites** (`loading` / `failed` come from a named `computed()` in the
component, never inline template logic — R-6):

| # | Surface | `loading` | `failed` | `loadingLabel` | `readyLabel` |
|---|---|---|---|---|---|
| 1 | `pages/home/home.html` (Discover) | `!failed() && venues() === undefined` | `failed()` | Loading venues… | `''` — the persistent results-count region already announces the count (B-7) |
| 2 | `operator/set-editor.html` | `!loaded()` | — | Loading this venue’s sets… | Sets loaded. |
| 3 | `booking/my-bookings.ts` | `loading()` | — | Loading your bookings… | Your bookings loaded. |
| 4 | `operator/daily-view-tab.html` | `!loaded()` | `loadError()` | Loading the daily view… | Daily view loaded. |
| 5 | `operator/requests-tab.html` | `!loaded()` | `loadError()` | Loading requests… | Requests loaded. |
| 6 | `operator/payouts-tab.html` | `!loaded()` | `loadErrorMsg() !== undefined` | Loading payouts… | Payouts loaded. |
| 7 | `venue/venue-map.html` | `!failed() && !notFound() && !venueView()` | `failed()` | Loading the beach map… | Beach map loaded. |
| 8 | `auth/set-password.ts` | `auth.restoring()` | — | Loading… | Account loaded. |

Rows 4 and 7 get a non-empty `readyLabel` **because** their availability/set-count regions sit
inside the loaded branch and are therefore rebuilt on load — unlike Discover's (row 1), which
sits above the `@if` chain and survives it (`home.ts`'s own comment: "survives every list
state, outliving the loading → grid/error transitions too").

**Angular posture:** signals + `computed()`, `input()` functions, `host` object, native control
flow, no `standalone: true`, no explicit `OnPush` (v22 defaults) — per the angular-cli MCP
best-practices guide.

## FE↔BE contract

N/A — no request or response shape changes.

---

## Execution status

**Stage pointer:** `implement (phase 2)` — the primitive exists and is green.

**Next action:** Adopt `app-load-announcer` on Discover, `set-editor` and `my-bookings`
(the three surfaces #741 names), red-first per surface.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Plan doc + draft PR | ✅ | draft PR #743 |
| 1 — The `load-announcer` primitive (TDD) | ✅ | |
| 2 — Adopt on the three surfaces #741 names | ⏳ | |
| 3 — Adopt on the five surfaces the grill swept up | | |
| 4 — e2e, docs freshness (RV-FE-10), close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `docs/plans/loading-announcements.md` — this plan.
- `frontend/src/app/shared/load-announcer.ts` — the new primitive.
- `frontend/src/app/shared/load-announcer.spec.ts` — its contract spec (AC-1, AC-2).
- `frontend/src/app/pages/home/home.ts|.html` — Discover: `loading` computed; announcer hoisted out of the `@if`; skeleton container `aria-hidden`, `aria-live` dropped.
- `frontend/src/app/pages/home/home.spec.ts` — AC-3/AC-4/AC-5 for Discover.
- `frontend/src/app/operator/set-editor.ts|.html` — announcer; skeleton container `aria-hidden`, `aria-live` dropped.
- `frontend/src/app/operator/set-editor.spec.ts` — AC-3/AC-4/AC-5.
- `frontend/src/app/booking/my-bookings.ts` — announcer; loading container `aria-hidden`, `aria-live` dropped.
- `frontend/src/app/booking/my-bookings.spec.ts` — AC-3/AC-4/AC-5.
- `frontend/src/app/operator/daily-view-tab.ts|.html` — announcer; visible loading `<p>` `aria-hidden`, `aria-live` dropped.
- `frontend/src/app/operator/daily-view-tab.spec.ts` — AC-3/AC-4/AC-5.
- `frontend/src/app/operator/requests-tab.ts|.html` — same treatment.
- `frontend/src/app/operator/requests-tab.spec.ts` — AC-3/AC-4/AC-5.
- `frontend/src/app/operator/payouts-tab.ts|.html` — same treatment.
- `frontend/src/app/operator/payouts-tab.spec.ts` — AC-3/AC-4/AC-5.
- `frontend/src/app/venue/venue-map.ts|.html` — same treatment.
- `frontend/src/app/venue/venue-map.spec.ts` — AC-3/AC-4/AC-5.
- `frontend/src/app/auth/set-password.ts` — same treatment (inline template).
- `frontend/src/app/auth/set-password.spec.ts` — AC-3/AC-4/AC-5.
- `frontend/e2e/loading-announcements.e2e.ts` — AC-6, mocked suite (CI-run).
- `.claude/skills/riviera-review-overlay/references/frontend-conventions.md` — new **RV-FE-10** (live regions must outlive the content they announce), so the decision is enforced on future slices rather than re-derived.

---

## Phase 0 — Plan doc + draft PR

**Files:** Create `docs/plans/loading-announcements.md`

- [ ] Commit the plan doc, push `claude/sdlc-741-4966yh`, open the **draft** PR referencing #741.
- [ ] Confirm the first CI run starts (CI fires on the `pull_request` event only).

## Phase 1 — The `load-announcer` primitive (TDD)

**Files:** Create `frontend/src/app/shared/load-announcer.ts` · Test `frontend/src/app/shared/load-announcer.spec.ts`

- [ ] **Step 1: Write the failing spec** — element identity preserved across loading→loaded
  (AC-1); empty text when `failed` (AC-2); `sr-only`/`role`/`aria-live` attributes.
- [ ] **Step 2: Run it, verify it fails** — `npm test -- load-announcer` → FAIL (module not found).
- [ ] **Step 3: Minimal implementation** — the component above.
- [ ] **Step 4: Green** — `npm test -- load-announcer`.

## Phase 2 — Adopt on the three surfaces #741 names

**Files:** Modify `home.ts|.html`, `set-editor.ts|.html`, `my-bookings.ts` · Test their three specs

- [ ] Per surface, red first: assert the announcer is present in the **loaded** state (fails
  today — the region only exists while loading).
- [ ] Hoist the announcer out of the `@if`; drop `aria-live` from the loading container; move
  `aria-hidden="true"` onto it; delete the now-duplicated `sr-only` line.
- [ ] Rewrite the three specs' announcement assertions so they stop asserting an announcement
  that was never proven (R-5) and assert the mechanism instead.
- [ ] Green: `npm test -- home my-bookings set-editor`.

## Phase 3 — Adopt on the five surfaces the grill swept up

**Files:** Modify `daily-view-tab.ts|.html`, `requests-tab.ts|.html`, `payouts-tab.ts|.html`, `venue-map.ts|.html`, `set-password.ts` · Test their five specs

- [ ] Same red-green shape per surface; the visible "Loading…" paragraph keeps its text and
  becomes `aria-hidden="true"`, losing `aria-live`/`role="status"`.
- [ ] Green: `npm test -- daily-view requests-tab payouts-tab venue-map set-password`.

## Phase 4 — e2e, docs freshness, close-out

**Files:** Create `frontend/e2e/loading-announcements.e2e.ts` · Modify `.claude/skills/riviera-review-overlay/references/frontend-conventions.md`

- [ ] Mocked-suite spec: delay the venues response, assert the announcer node exists before and
  after and that its text changed (AC-6).
- [ ] Add **RV-FE-10** to the review overlay's FE conventions.
- [ ] `npm run lint`, `npm run format:check`, full `npm test`, `npm run test:e2e:a11y`.
- [ ] Mark the PR ready for review → Review gate, Sonar gate, merge close-out.

---

## Generalization-audit log

> Enumerate by **mechanism**, not resemblance.

| # | Trigger | Mechanism named | Command that enumerated the population | Population | Decision |
|---|---|---|---|---|---|
| G-1 | #741 names three surfaces | "an `aria-live`/`role=status` element that enters the DOM already holding its text and is removed wholesale" | `grep -rn 'aria-live\|role="status"\|<output' frontend/src --include=*.html --include=*.ts \| grep -v '\.spec\.ts'` | 8 **loading** regions (the 3 named + `daily-view-tab`, `requests-tab`, `payouts-tab`, `venue-map`, `set-password`) | All 8 fixed (maintainer confirmed scope) |
| G-2 | Same sweep, adjacent population | The same shape on **result/notice** regions (`<output>`, admin notices, `home.html:143` empty state) | same command | ~20 | Out of scope (Non-goals) — different defect class; several are already correct. Recorded, not silently dropped |
| G-3 | R-4 | "a surface whose loaded state is also reachable on error" | read each of the 8 components' error signals | 4 of 8 have an explicit error signal | `failed` input added so none announces "loaded" on failure |

---

## Acceptance-criteria verification (final)

| AC | Verified by | Result |
|---|---|---|
| AC-1 | `load-announcer.spec.ts` | |
| AC-2 | `load-announcer.spec.ts` | |
| AC-3 | 8 surface specs | |
| AC-4 | 8 surface specs | |
| AC-5 | 8 surface specs | |
| AC-6 | `loading-announcements.e2e.ts` | |
| AC-7 | lint + format + `npm test` + `test:e2e:a11y` | |

---

## Self-review checklist (before merge / PR)

- [ ] All ACs verified above, with real results (not "should pass").
- [ ] `node scripts/check-plan-file-structure.mjs --diff origin/main` clean (plan doc staged first).
- [ ] `node scripts/check-touch-target.mjs --files <touched>` clean (no new interactive controls, but the touched templates are in scope).
- [ ] Open questions empty or each citing a follow-up issue.
- [ ] Findings register current; every finding re-entered at Implement.
- [ ] No spec claims an announcement it does not prove (R-5).
- [ ] Follow-up issue filed for silent failure panels (Non-goals).
- [ ] `riviera-docs-freshness` run over the slice's diff.
