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
- [ ] **AC-2:** Given `app-load-announcer` outside both `loading` and `ready`, when it renders,
  then its text is empty — any exit the call site did not call ready is silent, and `loading`
  wins over `ready` if both are asserted. *Pinned by:* `shared/load-announcer.spec.ts` (two specs).
- [ ] **AC-8:** Given each surface's non-success exits — the beach map's 404, My bookings' failed
  account read, the account page's signed-out visitor — when they render, then the announcer says
  nothing. *Pinned by:* `venue-map.spec.ts`, `my-bookings.spec.ts`, `set-password.spec.ts`; all
  three mutation-checked.
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

- **Failure announcements.** Settled at round 7, after two rounds got the inventory wrong in
  opposite directions. Ground truth: `role="alert"` is the house pattern — 56 occurrences across
  the app, and **7 of these 8 surfaces** already carry one on their failure branch (`home`,
  `set-editor`, `venue-map` ×2, `set-password`, and the `daily-view-tab` / `requests-tab` /
  `payouts-tab` error paragraphs, each inside `@else if (loadError())`, i.e. inserted on the
  transition — the reliably-announced case). `shared/failure-panel.ts` carries no role of its own;
  its three call sites add one by hand. So failures are covered, and this slice's job on that side
  is only to keep the announcer from *contradicting* a panel. **The one exception is
  `my-bookings`**, both of whose failure cards are genuinely silent: `booking-row-failed` has no
  role (round 4 gave it `role="alert"`, round 5 reverted that — a per-row assertive region is the
  wrong shape, F-25), and `account-error` has `role="status"` but is born holding its text inside
  `@if (accountError())`, the very defect this slice removes elsewhere. Those two → follow-up issue
  at close-out. No other surface belongs in it.
- **The result/notice regions** (`<output>` elements, admin notices, `booking-view`'s
  withdraw/cancel results). Some share the born-with-text shape, but they are result
  announcements, not loading ones, and several are already correct. Out of scope.
- **`aria-busy`.** Considered and rejected: it is a hint about a region being updated, not an
  announcement mechanism, and adding it would not change what is spoken. The per-row
  `aria-busy` on my-bookings (a known booking still resolving inside a real list) stays as is.
- **The loading *visual*.** Raised by the maintainer mid-review: three of the eight surfaces show
  a pulsing skeleton and five show a centred "Loading…" line, and the skeleton is the better
  treatment for at least four of the five (it mirrors the loaded layout, so nothing jumps). That
  is a real gap and this plan's Non-goals should have named it from the start — it was a hole,
  not a decision. Deliberately **not** folded in here: a skeleton's value is per-surface layout
  mirroring, so it is four real pieces of work, and it is orthogonal to the announcement (the
  announcer behaves identically either way). → **issue #744**, with the four-not-five scope and
  the `aria-hidden` + `motion-reduce` constraints this slice imposes on it.
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
| R-1 | Inserting a persistent element at the top of a template shifts `:first-child`/`nth-child`/`first:` styling | Medium | Visual regression | **Closed.** Host is `class: 'contents'` and the inner `<p>` is `sr-only` (absolutely positioned → out of flow, not a flex/grid item); `grep -n 'first:\|nth-child\|first-child\|last:'` over all eight touched templates returns nothing |
| R-2 | Double announcement where a persistent count region already speaks (Discover) | Medium | Noisy AT | **Closed.** Only Discover's count region is persistent, so only Discover's `readyLabel` is empty; `venue-map` and `daily-view-tab` count regions sit inside the loaded branch and are rebuilt, so they get a real one |
| R-3 | `readyLabel` derived from a live count would re-announce on every later mutation (date change, accepting a request) | Medium | Noisy AT | **Closed.** `readyLabel` is a static string at all eight call sites; pinned by RV-FE-10 for future slices |
| R-4 | The announcer announces "loaded" when the load failed | High if unguarded | Wrong information to AT | **Closed — but only after the review gate caught the first fix being wrong.** A `failed` flag was fail-open and three call sites had unbound exits (F-1/F-2/F-3). The shipped `ready` input is fail-safe: an undescribed exit is silent (AC-2, AC-8) |
| R-5 | jsdom cannot prove a real screen reader announces | Certain | False confidence | **Closed.** Specs assert the *mechanism* (element identity across the transition) and were **mutation-checked**: moving the announcer back inside `requests-tab`'s `@if` fails the new spec, so it bites the exact defect. Spec titles/comments no longer claim an announcement none of them proved |
| R-6 | Eight surfaces adopted mechanically, one signal mapped wrong (e.g. a surface whose "loaded" is also its error state) | Medium | Silent or wrong announcement | **Closed.** `home` and `venue-map` got named `loading` computeds; the other six bind an existing signal directly. Each asserted per surface (AC-3/AC-4) |

---

## Open questions / Assumptions

All questions resolved; the two assumptions below held through implementation and are recorded
as decisions, not open items.

- **A-1 (assumption, held):** Announcing the *completion* is the valuable half; the initial-mount
  "Loading…" text may still go unspoken because the component mounts already loading. This
  matches angular.dev's own framing ("screen readers that focus on a deferred section will
  initially read the placeholder … but may not announce changes when the deferred content
  loads"). A deferred first write to force the initial announcement was considered and
  rejected as untestable timing hackery. **Re-loads** (filter change, date change, retry) do
  announce "Loading…" because the region is already mounted.
- **A-2 (assumption, held):** Static ready sentences ("Beach map loaded.") over live counts — R-3.

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

API: `loading = input.required<boolean>()` · `ready = input(false)` ·
`loadingLabel = input.required<string>()` · `readyLabel = input('')`;
`message = computed(() => loading() ? loadingLabel() : ready() ? readyLabel() : '')` — so
`loading` wins a contradiction, and any state that is neither is silent.

**The eight adoption sites** (a surface with a non-trivial chain names its phase in a `computed()`
rather than inline template logic — R-6):

| # | Surface | `loading` | `ready` (the **loaded branch**, nothing else) | `loadingLabel` | `readyLabel` |
|---|---|---|---|---|---|
| 1 | `pages/home/home.html` (Discover) | `!failed() && venues() === undefined` | — (no `readyLabel`) | Loading venues… | `''` — the persistent results-count region already announces the count (B-7) |
| 2 | `operator/set-editor.html` | `!loaded()` | `loaded()` | Loading this venue’s sets… | Sets loaded. |
| 3 | `booking/my-bookings.ts` | `loading()` | `announceReady()` — a named computed over **four** conditions; this surface leaves its loading state in four ways that are not "loaded" (F-8, F-10) | Loading your bookings… | Your bookings loaded. |
| 4 | `operator/daily-view-tab.html` | `!loaded()` | `loaded() && !loadError()` | Loading the daily view… | Daily view loaded. |
| 5 | `operator/requests-tab.html` | `!loaded()` | `loaded() && !loadError()` | Loading requests… | Requests loaded. |
| 6 | `operator/payouts-tab.html` | `!loaded()` | `loaded() && loadErrorMsg() === undefined` | Loading payouts… | Payouts loaded. |
| 7 | `venue/venue-map.html` | `!failed() && !notFound() && !venueView()` | `!!venueView()` — which is the loaded branch, so it covers the 404 and the failure at once | Loading the beach map… | Beach map loaded. |
| 8 | `auth/set-password.ts` | `auth.restoring()` | `!erased() && !auth.restoring() && auth.signedIn()` | Loading… | Account loaded. |

**The input is `ready`, not `failed` — the review gate's doing.** The first cut asked each call
site "did it fail?", which makes silence conditional on remembering every non-success exit; three
of the eight had one nobody had bound. `ready` inverts it, so an undescribed exit is silent
instead of announcing "…loaded." over a panel saying the opposite. Fail-safe, not fail-open.

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

**Stage pointer:** `review gate — round 7 fixes pushed, re-review due`.

**Next action:** Re-review the round-7 diff. If it comes back clean, confirm CI green on the
final head, pull Sonar's new-issue + duplication list from the API for that head (a green gate
is not the check), then run the merge close-out in `riviera-sdlc` `references/pr-gates.md` §3.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Plan doc + draft PR | ✅ | draft PR #743 |
| 1 — The `load-announcer` primitive (TDD) | ✅ | |
| 2 — Adopt on the three surfaces #741 names | ✅ | |
| 3 — Adopt on the five surfaces the grill swept up | ✅ | |
| 4 — e2e, docs freshness (RV-FE-10), close-out | ✅ | |
| 5 — Review-gate findings F-1…F-7 | ✅ | |
| 6 — Re-review findings F-8, F-9 | ✅ | |
| 7 — Second re-review findings F-10…F-12 | ✅ | |
| 8 — Third-round findings F-13…F-16 | ✅ | |
| 9 — Fourth-round findings F-17…F-24 | ✅ | |
| 10 — Fifth-round findings F-25…F-31 (F-17 reverted; F-29…F-31 deferred) | ✅ | |
| 11 — Sixth-round findings F-32…F-39 (F-27 reversed; F-29…F-31 carried to the checklist) | ✅ | |
| 12 — Seventh-round findings F-40…F-45 (round 6's inventory corrected; population now 2) | ✅ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review gate (`/code-review`, high) | `venue-map`: `[failed]` missed `notFound()`, so a 404 announced "Beach map loaded." over the not-available panel | fixed — `ready` inversion + spec, mutation-checked |
| F-2 | review gate (same run) | `my-bookings`: no failure binding at all, so a failed account read announced "Your bookings loaded." beside the retry card | fixed — same inversion + spec, mutation-checked |
| F-3 | review gate (same run) | `set-password`: a signed-out visitor (and the post-erasure state) heard "Account loaded." over "Sign in to manage your account" | fixed — same inversion + spec, mutation-checked; the transition spec's own premise was wrong too and was corrected |
| F-4 | review gate (same run) | `loading-announcements.e2e.ts` omitted `expectNoSeriousAxeViolations`'s required `context` argument | fixed |
| F-5 | review gate (same run) | untracked `e2e/zz-dbg.e2e.ts` debug spec left in the tree — it matches the mocked config's glob and would run | fixed — deleted (an earlier `rm` ran from the wrong cwd) |
| F-6 | review gate (noted, not reported) | `set-password`'s inline comment said "the announcer below" where it is above | fixed |
| F-7 | review gate (noted, not reported) | the plan's Non-goals claimed no failure panel is a live region; `home.html` and `venue-map.html` do carry `role="alert"` | fixed — Non-goals rewritten, and the follow-up issue narrowed to the surfaces genuinely uncovered |
| F-8 | **re-review** of the F-1…F-7 fix round | `my-bookings`: F-2 was not actually fixed. `loadDeviceLocal` clears `loading` synchronously while the account read is still out, so with a real async client `ready` went true and the region announced "Your bookings loaded." *before* the retry card appeared. My spec passed only because its `throwError` stub emits synchronously — the exact false comfort RV-FE-10 warns about, produced while writing RV-FE-10 | fixed — `accountPending` signal tracks the in-flight read (and closes the `retryAccount()` re-open); pinned by a `Subject`-based async spec covering both the first read and the retry, mutation-checked |
| F-9 | re-review (same run) | the plan's "New primitive" API block still documented `failed` and the old `message` computed, contradicting the `ready` table below it | fixed |
| F-10 | **second re-review** | `my-bookings`: the same premature-"loaded" window on the **more common** path — a guest with remembered codes, whose per-code rows are still skeletons when `loading` clears. Third instance of one mechanism | fixed — the four conditions hoisted into an `announceReady()` computed incl. `rows().every(state !== 'loading')`; pinned + mutation-checked |
| F-11 | second re-review | `my-bookings`: `loading`'s docstring claims it "gates the empty card so a signed-in account fetch in flight never flashes 'No booking yet'" — it cannot, being cleared by the device rows. A **pre-existing** visual bug its own doc denied | fixed — `accountPending` added to the empty gate, docstring corrected; pinned + mutation-checked. **Scope note:** visual, not announcement; taken because the fix is one token on a signal this slice added and the alternative was shipping a docstring known to be false |
| F-12 | second re-review | the F-8 regression spec never seeded device codes, so it exercised the zero-row path rather than the one its comment named (and its `getByCode` stub key was wrong) | fixed — seeded, and a second spec covers the device-row window directly |
| F-13 | **third review round** | `my-bookings`: the F-11 fix suppressed the empty card but put nothing in its place — `loading` was already false, so a signed-in customer with no device codes got a **blank page** for the whole account round trip. The spec asserted only the card's *absence*, so it could not see it | fixed — a `showSkeleton()` computed keeps the skeleton up while there is nothing to draw, and drives the announcer's `loading` too; the spec now asserts what IS there, not just what isn't |
| F-14 | third review round | `announceReady` counted a `'failed'` device row as loaded (`state !== 'loading'`), announcing success over a "Couldn't load this booking" retry card | fixed — `state === 'loaded'`; pinned + mutation-checked |
| F-15 | third review round | a per-row Retry could re-announce the page | **fixed by F-14, not by new code.** A latch was written for it, then removed: `row-retry` renders only inside the `'failed'` case, and a failed row now blocks the announcement, so the latch guarded an unreachable state — and deleting it failed no test (G-7). The spec asserts the real contract instead: silence → "loaded", never "loaded" → silence → "loaded" |
| F-16 | third review round (noted, not reported) | the plan's generalization log had G-6 inserted above G-5 | fixed |
| F-17 | **fourth review round** (re-review of the round-3 diff) | `my-bookings`: F-14 correctly stopped a `'failed'` row announcing success, but nothing took its place — the `booking-row-failed` card carries no role, so a partially-failed page now says nothing at all. `load-announcer.ts`'s own docstring and RV-FE-10 both assert "the failure panels carry `role="alert"`", which this card did not | **reverted in round 5 — see F-25.** The `role="alert"` shipped and was then taken back out: per-row is the wrong host for a live region, and the spec could not show it working |
| F-18 | fourth review round | `accountPending`'s TSDoc said "Protected only because the template reads it" — the template does not read it (only `showSkeleton()`/`announceReady()` do), and `loading` had become template-invisible too. A false doc of exactly the F-11 class | fixed — both `private`, docstring corrected to name the real readers |
| F-19 | fourth review round | four TSDoc blocks carried decision history and round-by-round issue refs ("A latch was written for this and then removed…", "#741 review round 3"), which `frontend/.claude/CLAUDE.md` forbids: TSDoc "states the contract, not the changelog". `check-inline-comments.mjs` exempts doc comments, so CI could not catch it (RV-STYLE-1) | fixed — contract kept, changelog removed. The bare `(#741)` markers were kept at first on a house-style argument; round 5 (F-26) overturned that and removed them too. The latch history lives in F-15/G-7, where it belongs |
| F-20 | fourth review round | the round-3 spec `says nothing when a device row failed` asserted **only** that the announcer was empty — it could not tell "a retry card, silently" from "a blank page, silently". The absence-only mistake F-13 was raised for, repeated in the fix for F-14 | fixed — it now asserts the retry card is present and carries `role="alert"`, then the silence |
| F-21 | fourth review round | the round-3 spec `announces once, after a row retry succeeds — never before it` could not observe the ordering it named: `of(...)` resolved the retry synchronously inside the click handler, so the intermediate `'loading'` window never rendered and the spec would pass with or without the contract | fixed — the retry now resolves through a `Subject`, and the spec asserts the row skeleton is up **and** the announcer silent mid-flight. Mutation-checked: restoring `of(...)` fails it |
| F-22 | fourth review round (noted, not reported) | `...stubService({})` in that spec was dead — `stubService` returns only `getByCode`, overwritten on the next line | fixed — spread dropped, the stub typed `Partial<BookingService>` like its siblings |
| F-23 | fourth review round | G-6's Outcome still claimed the fix gave "a single place to add the fifth condition", while the same commit added F-13's condition to a **second** computed (`showSkeleton()`) — the row cited a finding that falsified its own conclusion | fixed — G-6's Outcome now states the real shape: two questions, two computeds, neither allowed to split across inline conditions |
| F-24 | fourth review round (noted, not reported) | F-13…F-16 were appended **above** the pre-existing F-12 row — the same out-of-order defect F-16 itself records for G-5/G-6, committed one table higher | fixed — F-12 restored to sequence |
| F-25 | **fifth review round** (re-review of the round-4 diff) | F-17's `role="alert"` was the wrong fix, on three counts the round-4 review did not reach: (a) `alert` is **assertive and per-row** — five offline codes fire five interrupting copies of the same sentence, and it is louder than the *page-level* account-failure panel 65 lines up, which is the polite `role="status"`; (b) `@for … track` implements a re-sort as detach+insert, so `inDisplayOrder` can re-announce a failure that has not changed; (c) decisively, the spec pinned it in a state where it cannot work — `throwError` resolves inside the first `detectChanges()`, so the card is in the **initial** render, and an alert already present at first paint is not spoken. The attribute was proven present, never proven to announce | **fixed by reverting F-17.** The card is back to no role, and the whole failure-announcement question — `booking-row-failed` included — goes to the follow-up issue, where the population can be fixed by one mechanism rather than a sixth hand-placed attribute (the G-5 lesson) — noting that `appFailurePanel` is **not** that mechanism today: its only three call sites (`home`, `venue-map` ×2) already carry their own `role="alert"`, and none of the deferred surfaces use the directive at all. Silence on failure was always this plan's stated Non-goal, and round 4 broke that scope decision on a "regression" framing that was wrong: on `main` this path was **silent**, exactly as B-5 records — the false "Your bookings loaded." was introduced by this slice's own rounds 1–3 and killed by F-14 before it ever shipped. So the revert restores `main`'s behaviour, it does not regress it |
| F-26 | fifth review round | the round-4 TSDoc rewrite kept its `(#741)` markers, arguing house style. The rule does not allow it: `frontend/.claude/CLAUDE.md` §Comments says TSDoc "states the contract, not the changelog (**no issue numbers**, no decision history)" — and since `check-inline-comments.mjs` exempts doc comments, the written rule is the only authority | fixed — the four markers removed. Provenance lives in this plan and in git history, which is what they are for |
| F-27 | fifth review round | the round-4 retry spec still ended on the assertion that already ends `keeps a transiently-failed code and retries it` 340 lines above, leaving two owners for one happy path. Round 4 dismissed the overlap on Sonar-CPD grounds; the maintenance argument is the better one | fixed — the duplicated terminal assertion dropped. What is left is the in-flight window, which is the only thing this spec knows and the other cannot see |
| F-28 | fifth review round | the Non-goals list named `my-bookings`' account-error card among the "still-uncovered" failure surfaces, but it carries `role="status"` (my-bookings.ts:237). The follow-up issue would have been filed asking for a role that is already there | fixed — the card removed from the list, with the reason stated; `booking-row-failed` takes its place after the F-25 revert |
| F-29 | fifth review round | **RV-FE-9, pre-existing:** the per-row Retry destroys the focused button — `retry()` → `fetch()` → `setRow('loading')` swaps the `@case ('failed')` subtree for the skeleton in the same tick — and no `focusMover()` runs, so focus strands on `<body>` (WCAG 2.4.3). `retryAccount()` does the same to `account-retry` | **deferred → follow-up issue at close-out.** Real and named (the repo's most-repeated bug class), but not this slice's: both buttons and both transitions predate #741, the diff changes neither, and choosing the focus target is design work, not a one-liner. Recorded rather than dropped |
| F-30 | fifth review round | on the same account-retry path, the page shows no busy indicator and an empty live region for the whole second round trip (`rows()` is non-empty, so `showSkeleton()` stays false) | **deferred → same follow-up issue.** The announcer is silent rather than wrong, which is this slice's contract; making a *retry* audible is the follow-up's question, alongside F-29's focus target on the identical control |
| F-31 | fifth review round | nothing enforces "every failure surface announces itself" — it is hand-placed attributes, which is how `booking-row-failed` was missed in the first place | **folded into the follow-up issue**, scoped to *one mechanism for the population* rather than per-site — the durable form of the G-5 lesson. The issue must not presume `appFailurePanel` is that mechanism (F-34) |
| F-32 | **sixth review round** (re-review of the round-5 diff) | **F-27's fix was a defect.** Dropping the retry spec's terminal row assertion left it vacuously satisfiable: `rows().every(…)` is true for an empty array, so a retry that made the booking *disappear* still **satisfied** `announceReady()` and still read "Your bookings loaded." — over the "No booking yet" card. Reviewer mutation-verified it; reproduced here (replace `fetch`'s success `tap` with a filter-out: before, 28 specs went red and this one stayed green; after, it goes red too). The absence-only class of F-13 and F-20, reintroduced by the fix for a *duplication* complaint | fixed — the spec asserts the failed card is gone and the loaded row carries the code, alongside the announcement. F-27 is reversed; F-36 records the settled position |
| F-33 | sixth review round | F-28 struck `my-bookings`' account-error card from the follow-up list because it "carries `role="status"`, politely announced on insertion" — conflating the two roles. It sits inside `@if (accountError())`, **born holding its text**, which is this slice's whole premise; only `role="alert"` is reliably announced on insertion. A failed account read is therefore announced by nothing, and F-28 had removed its ticket | fixed — the card is back on the follow-up list with the reason stated |
| F-34 | sixth review round | F-25 and F-31 deferred the work to "the shared `failure-panel` host", but `appFailurePanel` has exactly three call sites (`home`, `venue-map` ×2) and all three already carry their own `role="alert"`; **none** of the deferred surfaces use the directive. A follow-up scoped that way would change nothing | fixed — the deferral now says "one mechanism for the population" and names `appFailurePanel` as explicitly not-it |
| F-35 | sixth review round | F-25's justification — "pre-slice this path *lied*, which is worse than silent" — is false, and contradicts this plan's own B-5 row. On `main` the failed path was silent; the lie was introduced by rounds 1–3 and killed by F-14 before shipping. The revert was still right, for its other three reasons | fixed — F-25's wording corrected. The register no longer states two mutually exclusive facts about `main` |
| F-36 | sixth review round | the round-4 "considered and rejected" bullet still rejected the retry-spec duplication concern that F-27 had since accepted — and that F-32 has now reversed again | fixed — the bullet records the whole arc and the settled position: the overlap is deliberate, because a spec asserting "loaded" must assert *what* loaded |
| F-37 | sixth review round | phase 10 was ticked ✅ while F-29/F-30/F-31 stayed open, and the merge checklist named only "silent failure panels" — so the two accessibility findings round 5 "recorded rather than dropped" had nothing carrying them into a filed issue | fixed — the checklist now has a second, explicit follow-up line for the Retry controls, and the failure-panel line carries its full population |
| F-38 | sixth review round | F-26 enforced "TSDoc carries no issue numbers, no decision history" on `my-bookings.ts` only, while the two files this slice **authored** — `load-announcer.ts` and `loading-announcements.e2e.ts` — kept both, the former with a full changelog paragraph about a `failed` flag "tried first". A rule enforced on one file and ignored on the slice's own is unciteable next review | fixed — both cleaned. `load-announcer.ts`'s `ready` paragraph now argues the polarity from the contract rather than from this PR's history |
| F-39 | sixth review round (noted, not reported) | the rewritten Non-goals bullet left a 113-char line in a ~100-col document that no formatter covers (`docs/` is outside `format:check`) | fixed — re-wrapped |
| F-40 | **seventh review round** (re-review of the round-6 diff) | **Round 6's correction was itself the error, and it went into two durable docs.** RV-FE-10 and `load-announcer.ts` were rewritten to say only three panels carry `role="alert"` and "the rest are silent". Ground truth, counted this round: **56** occurrences across the app, and **7 of these 8 surfaces** already have one on their failure branch. The original sentence round 6 replaced was substantially right | fixed — both restored to the true statement, with the real exception (`my-bookings`, both cards) named instead of an invented one. Lesson logged as G-8: a *count* asserted in a durable doc gets counted, not inherited from a review finding |
| F-41 | seventh review round | flowing from F-40: the `daily-view-tab`, `requests-tab` and `payouts-tab` error paragraphs had been in the follow-up scope since F-7, but all three carry `role="alert"` **inside `@else if (loadError())`** — inserted on the transition, the reliably-announced case. The issue would have asked for roles already there: the exact defect F-28 named and F-33 thought it had fixed | fixed — the follow-up population is now exactly two, both on `my-bookings`. The Non-goals bullet and the merge checklist say so, and say not to widen it |
| F-42 | seventh review round | the F-38 rewrite of `load-announcer.ts` swapped one TSDoc-rule violation for another: it removed the issue numbers but added a cross-file inventory of three other components' markup (state of other files, not this component's contract — and already stale, per F-40) and kept the "used to do the opposite … specs stayed green" changelog | fixed — the paragraph now argues the contract: what a live region announces, what `ready` buys, and to check the call site's failure branch rather than assume it |
| F-43 | seventh review round (noted, not reported) | de-issue-numbering the e2e header pushed line 6 to 113 chars; Prettier does not rewrap comment prose, so `format:check` cannot see it — F-39's defect, reintroduced in the same commit that fixed it | fixed — re-wrapped |
| F-44 | seventh review round | RV-FE-10's new text told reviewers a silent failure branch is "a finding for the backlog, not something to fix inline" — generalising a scope call made for *this* PR's per-row alert into a standing ban on fixing a one-attribute a11y gap in the diff under review | fixed — the item now says `role="alert"` on the panel in the diff is usually the right fix, and scopes the prohibition to what actually earned it: a live region **per row** of a list |
| F-45 | seventh review round (noted, not reported) | F-32's row said the vacuous spec "still cleared `announceReady()`" — the inverted verb; it *satisfied* it, which is why the announcement fired | fixed |


**Considered and rejected in round 4** (recorded so the next reader does not re-derive them):

- *"`showSkeleton()` omits per-code rows still resolving, so the announcer is silent while row
  skeletons are up."* — Not a defect. The sequence a guest gets is "Loading your bookings…"
  (page skeleton) → `''` (row skeletons) → "Your bookings loaded."; emptying a live region
  announces nothing, so no announcement is lost, and the row skeletons carry `aria-busy`. The
  two computeds answer different questions **by design** — now stated in `showSkeleton()`'s
  docstring and in G-6 rather than left implicit (F-19, F-23).
- *"`showSkeleton()` can flip false→true after content has rendered, tearing the list down."* —
  Unreachable as described. Only a `'loading'` row can leave `rows()` (the 404 filter); a
  `'loaded'` row never does, so `rows()` can empty back out only from a set that was still
  skeletons. Rendering the page skeleton when there is again nothing to draw and a read is
  still out is exactly the contract, and the resulting "Loading…" is accurate, not a lie.
- *"The new retry spec near-duplicates `keeps a transiently-failed code and retries it` —
  Sonar CPD risk."* — **Superseded, twice.** Round 5 accepted the maintenance form of it and
  dropped the shared terminal assertion (F-27); round 6 showed that deletion made the spec
  vacuously satisfiable and put it back (F-32). Settled position: the overlap is real and
  deliberate — `rows().every(…)` is true for an empty list, so a spec that asserts "loaded"
  must also assert what was loaded, whatever another spec happens to assert. Sonar reports
  0 duplicated blocks on the final head.
- *"The empty-card gate's coupling to `showSkeleton()`'s formula is untested."* — It is tested:
  the round-3 spec asserts the skeleton **is present** in that state, so narrowing
  `showSkeleton()` fails it. That assertion is what F-13 added.


**Considered and rejected in round 7:**

- *"`announceReady()` is true in the empty-list branch, so the announcer says 'Your bookings
  loaded.' over the 'No booking yet' card — the lie F-32 guards against."* — Not a lie, and not
  what F-32 is about. The page-level read **did** finish and produced no bookings; "Your bookings
  loaded." is exactly that sentence, and the empty card is the visible half of the same fact. This
  is the contract AC-1 pins and the canonical spec has asserted since phase 1. F-32's defect was
  that the *retry* spec could not distinguish a successful retry from one that made the booking
  vanish — a spec-observability gap, not a claim that a loaded-and-empty list must stay silent.
- *"The canonical `[ready]` spec asserts 'loaded' with zero rows — the same vacuity."* — Same
  answer: zero rows is the state that spec exists to cover. The rule F-32 settled is narrower than
  "never assert loaded without rows": a spec asserting a **transition produced something** must
  assert what it produced.

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
- `frontend/e2e/layout-editor.e2e.ts` — one assertion follows the words out of `set-loading` into the announcer.
- `.claude/skills/riviera-review-overlay/SKILL.md` — index the new RV-FE-10 alongside RV-FE-8/9.
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
| G-4 | The three surfaces' text moved out of their loading containers | "a test that asserts loading copy **through the container** rather than the announcer" | `grep -rn 'Loading ' frontend/e2e frontend/src --include=*.ts` | 1 outside the diff — `layout-editor.e2e.ts:293` | Updated in this PR; it now asserts the announcer's text and the container's `aria-hidden` |
| G-5 | Review findings F-1/F-2/F-3 | **The audit that missed them (G-3) is the lesson.** G-3 enumerated "surfaces with an explicit error signal" — resemblance, not mechanism. The mechanism is "a branch of the surface's `@if` chain that is neither loading nor loaded", which also covers a 404, a partial read and a signed-out visitor. Re-enumerated by reading all eight `@if` chains, not by grepping for error-shaped names | 3 more exits on 3 surfaces | Fixed by inverting the input to `ready` so the population no longer has to be enumerated correctly — an exit nobody described is silent by construction. RV-FE-10 states the rule |
| G-6 | Re-review findings F-8, F-10, F-13 | **The same mechanism, a third time.** "A signal that leaves the loading state before every read behind it has settled." Enumerated by reading each `set(false)`/`set(true)` on every phase signal in the eight components and asking what is still in flight at that line | `my-bookings` only — the other seven set their phase signal once, at the point their single read settles | Fixed by hoisting the announcement conditions into one named `announceReady()` computed. F-13 then showed the surface answers **two** questions, not one — *what is drawn* (`showSkeleton()`) and *what is announced* (`announceReady()`) — so there are two computeds by design, each with its own contract; what must never split again is either question across several inline conditions |
| G-7 | Review round 3 | "a clause added to guard a state the template cannot reach" — asked of each condition in `announceReady` by tracing back to the control that produces it | 1: the latch written for the per-row-Retry re-announcement | **Removed.** `row-retry` renders only inside the `'failed'` case, and a failed row already blocks the announcement, so the latch guarded an unreachable state — and the mutation check proved it: deleting it failed no test. A clause no test can distinguish is not defence in depth, it is a claim the code does not have to keep |
| G-8 | Review round 7 | **"a count asserted in a durable doc."** Round 6 wrote "three panels carry `role="alert"`, the rest are silent" into RV-FE-10 *and* `load-announcer.ts` — inherited from a review finding, never counted. Enumerated by actually running `grep -rn 'role="alert"' frontend/src` and then checking each of the eight surfaces' failure branch | 56 occurrences; 7 of the 8 surfaces covered, 1 not | **Both docs corrected (F-40).** The rule this leaves behind: a number or inventory that goes into a skill reference or a shared component's TSDoc gets counted at the moment it is written, and re-counted when it is edited — it outlives the PR that wrote it, and a review finding is a hypothesis, not a census |

---

## Acceptance-criteria verification (final)

| AC | Verified by | Result |
|---|---|---|
| AC-1 | `load-announcer.spec.ts` › "keeps the SAME element across loading → loaded…" | ✅ |
| AC-2 | `load-announcer.spec.ts` › "says nothing on any exit the call site did not call ready…" + the contradiction spec | ✅ |
| AC-3 | 8 surface specs › "announces through one region that survives loading → loaded (#741)" | ✅ |
| AC-4 | the same 8 specs (identity assertion) — **mutation-checked** on `requests-tab` | ✅ |
| AC-5 | the same 8 specs (`aria-hidden` on the skeleton / visible copy) | ✅ |
| AC-6 | `loading-announcements.e2e.ts` — **mutation-checked**: scoping the region back inside Discover's `@if` fails it in 5s | ✅ |
| AC-7 | `npm run lint` ✅ · `format:check` ✅ · `npm test` ✅ 176 files / 1613 tests · `test:e2e:a11y` ✅ 233/233 | ✅ |
| AC-8 | `venue-map.spec.ts` / `my-bookings.spec.ts` / `set-password.spec.ts`, all three mutation-checked | ✅ |

---

## Self-review checklist (before merge / PR)

- [x] All ACs verified above, with real results (not "should pass").
- [ ] `node scripts/check-plan-file-structure.mjs --diff origin/main` clean (plan doc staged first).
- [ ] `node scripts/check-touch-target.mjs --files <touched>` clean (no new interactive controls, but the touched templates are in scope).
- [x] Open questions empty; the two assumptions held and are recorded as decisions.
- [ ] Findings register current; every finding re-entered at Implement.
- [x] No spec claims an announcement it does not prove (R-5) — titles and comments rewritten on all three surfaces that carried the claim.
- [ ] Follow-up issue filed for the two silent failure surfaces (Non-goals) — scope is exactly
      `my-bookings`' `booking-row-failed` card (no role) and its `account-error` card
      (`role="status"`, born with its text). Every other surface already carries `role="alert"`;
      do not widen it, and do not presume `appFailurePanel` is the mechanism (F-25, F-40, F-41).
- [ ] Follow-up issue filed for the two Retry controls' accessibility (F-29, F-30): both
      `row-retry` and `account-retry` destroy the focused button with no `focusMover()`
      (RV-FE-9 / WCAG 2.4.3), and the account retry shows no busy state for its round trip.
- [x] `riviera-docs-freshness` run over the slice's diff — one finding, fixed here: no substrate doc stated a live-region rule, so RV-FE-10 was added to the review overlay (+ its SKILL.md index).
