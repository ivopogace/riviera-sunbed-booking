# Shell overlays survive the initial navigation — Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** The shell's close-every-overlay-on-`NavigationEnd` rule fires only for a navigation
that actually changes the URL, so the initial lazy-load navigation no longer shuts a header
overlay the user opened while the first route's chunk was still in flight.

**Architecture:** When an overlay goes up, the shell records the id of the navigation then in
flight (`router.currentNavigation()?.id`, `0` when the router is idle); the `NavigationEnd`
subscription skips the close for exactly that navigation. The discriminator is navigation
IDENTITY, not the URL: "the navigation that was already running when you opened this" is the
thing the user did not do, whatever URL it lands on. Rejected alternatives: comparing
`urlAfterRedirects` against a tracked shown-URL (shipped first, then withdrawn at the review
gate — finding F-1: it also swallows a navigation the guest DID start from inside an overlay
onto the URL they deep-linked to, hanging the find modal); `event.id === 1` (a guard redirect
re-issues under a new id — Q-3); and `router.navigated` / `lastSuccessfulNavigation()` (both
already flipped for the current navigation when subscribers see the event — Q-1).

**Persistence:** N/A — frontend-only, no schema and no backend code in scope (invariant #1 untouched).

**Source of intent:** GitHub issue #892 (follow-up recorded by PR #891's Scope notes).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — confirmed no open
PRs and no in-flight overlap; its re-entry rule sent the F-1 fix back through Implement rather
than patching it at the review gate) · `riviera-plan-doc` (this template — forced the seam per
AC, and the rejected-alternatives note that made F-1's mechanism swap legible) · `tdd` (each
spec proven red before it went green: the keep-open one against an unguarded subscription, the
supersede one against the withdrawn URL rule) · `riviera-review-overlay` (review gate — ran at
ready-for-review and again on the F-1 fix; RV-STYLE-1 caught F-3, RV-PROC-1 caught this line's
own stale parentheses) · `riviera-docs-freshness` (**ran** over `origin/main...HEAD`, 0 findings — no substrate doc
states the shell's overlay-close rule, and the slice creates no Nth-of-something) ·
`riviera-frontend` (placement: the rule stays in the shell component `app.ts`, no new `core/`
service — it is shell-local state, not a cross-cutting singleton; Q-4) · `angular-developer` +
`@angular/router` 22.0.7 sources (pinned four behaviours the design turns on: the
`lastSuccessfulNavigation`-before-`NavigationEnd` ordering, `NavigationStart` preceding a
non-awaited `navigate()`, config vs guard redirects keeping/re-issuing the navigation id, and —
via the MCP's `search_documentation` — that `getCurrentNavigation()` is deprecated in v22 in
favour of the `currentNavigation` signal, whose documented "null when idle" contract is exactly
what the guard needs) ·
`riviera-local-debug` (scoped Vitest runs via `ng test --include`, `PW_CHROMIUM_EXECUTABLE` for
the mocked e2e) · `playwright-cli` (the e2e half: `awaitRoutedPage` stays; its header is the
only e2e change, restated after F-2) · `riviera-tailwind` (N/A — no styling in scope)

**Branch:** `claude/sdlc-892-o837s0` — the cloud session's designated remote branch stands in
for `bugfix/shell-overlay-initial-navigation`.

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given the find-a-booking modal was opened while a navigation to a still-loading
  lazy route was in flight, when that navigation's chunk lands and it completes, then the modal
  is still rendered and `document.activeElement` is the element that held focus before it.
  *Seam:* the `app-root` shell observed through `Router` navigation + rendered DOM ·
  *Pinned by:* `app.spec.ts` › `keeps an overlay open when the navigation it was opened during
  completes (#892)` — proven red against `main`'s unguarded subscription
- [x] **AC-7:** Given the find-a-booking modal was opened in that same window, when a navigation
  raised from inside it supersedes the pending one and lands on the very same URL (what
  `find-booking` does for a code the guest is already deep-linked to), then the modal closes and
  focus moves to `main` — `find-booking.ts:191` relies on the shell for this and has no
  self-close on `navigated === true`. *Seam:* as AC-1 · *Pinned by:* `app.spec.ts` › `closes an
  overlay when a navigation raised from inside it supersedes the pending one (#892)` — proven
  red against the withdrawn URL-equality guard
- [x] **AC-2:** Given the find-a-booking modal is open, when the router navigates to a
  different URL, then the modal is removed and focus moves to `main` (WCAG 2.4.3) —
  unchanged behaviour. *Seam:* same as AC-1 · *Pinned by:* `app.spec.ts` › `closes the Find a
  booking modal on navigation and moves focus to main (a11y, #148)` (existing, body unchanged)
- [x] **AC-3:** Given the signed-in account menu is open and holds focus, when the router
  navigates to a different URL, then the menu is removed and focus moves to `main` —
  unchanged behaviour. *Seam:* same as AC-1 · *Pinned by:* `app.spec.ts` › `moves focus to
  main when a navigation closes the account menu (a11y, #351)` (existing, body unchanged)
- [x] **AC-4:** Given the find modal is open with a known booking code, when the code is
  submitted and the app navigates to `/booking/:code`, then the modal is gone from the detail
  view. *Seam:* the mocked Playwright suite against the running SPA · *Pinned by:*
  `frontend/e2e/find-a-booking.e2e.ts` › the found-code flow (existing, unchanged)
- [x] **AC-5:** Given a reader of `frontend/e2e/support/shell.ts`, when they read its header,
  then `awaitRoutedPage` is still exported and used by every opener, and the header states
  that the wait is the test's own precondition (and still covers the post-sign-in redirect)
  rather than describing an app bug that is now fixed. *Seam:* the file's exported API +
  header comment · *Verified by:* review gate (RV-FE-E2E / RV-STYLE-1), no test asserts prose.
- [x] **AC-6:** Given the subscription in `app.ts`, when it is read, then a single-line inline
  comment names the rule ("only a navigation that changes the URL closes the overlays").
  *Seam:* the source line · *Verified by:* `node scripts/check-inline-comments.mjs --diff
  origin/main` (RV-STYLE-1 guard) + review gate.

## Non-goals

- Changing what the close does (which overlays, the focus hand-off to `main`) — only *when* it fires.
- Covering a first load redirected by a **guard**: that resumes under a fresh navigation id
  (Q-3), so it still closes overlays. A **config** `redirectTo` keeps its id and IS covered.
  Issue #892 scopes the redirect shape out explicitly.
- Removing or weakening `awaitRoutedPage` in the e2e suite (AC-5 keeps it).
- Any change to `provideRouter`'s initial-navigation feature (`enabledNonBlocking` stays —
  blocking initial navigation would trade this bug for a blank first paint).
- Backend, schema, styling, or new tokens.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — no surface is retired or replaced; one guard is added to an existing subscription.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The URL seed and `urlAfterRedirects` are serialised differently, so the guard never matches | high | high | — | claude | **obsolete** — the URL seed was withdrawn with F-1; the id rule compares two `number`s and has no serialisation surface |
| R-2 | The guard swallows a close it should perform (a real navigation to the same URL) | low | med | The router emits `NavigationSkipped`, not `NavigationEnd`, for a same-URL re-navigation — already relied on and pinned by the existing `#351` "activated on the page it points at" spec, which closes the popover from the link handler instead | claude | closed — that spec is green unchanged |
| R-3 | The guard swallows a close the user asked for, stranding an overlay | med | high | Realised as F-1 at the review gate, on the URL rule; the id rule cannot, because a navigation the user raises from inside an overlay always carries an id other than the one recorded when it opened. AC-7 pins it | claude | closed — AC-7 green, red against the old guard |
| R-4 | The four overlay-open paths each have to record the in-flight navigation, and a new overlay could forget to | low | med | One private `markOverlayRaised()` called from all four handlers, so the rule has a single home; a forgotten call fails open (the overlay closes on navigation, today's behaviour) rather than stranding an overlay | claude | closed — no new dependency; `Location` is no longer injected at all |
| R-5 | The e2e suite's `awaitRoutedPage` masks a regression of this fix (the app-side bug could come back unnoticed) | med | med | AC-1 is the unit-level pin and does not depend on the e2e timing; the e2e wait stays for its own reasons (AC-5) | claude | closed — AC-1 pins the app side without the e2e timing |

## Open questions / Assumptions

- *(none open)*

### Resolved

- **Q-4 (resolved at the review gate):** is the shell the right owner of the bookkeeping — or does
  it belong in `core/`? **The shell.** `riviera-frontend`'s taxonomy puts cross-feature stateful
  singletons in `core/`; `overlayNavId` is written and read only inside the shell's own overlay
  handlers and its `NavigationEnd` subscriber, so it is component-local. Confirmed by the review
  gate's CLAUDE.md pass.
- **Q-3 (resolved at the review gate):** does a redirect break a navigation-id rule? **Only a
  guard redirect.** Probed against `@angular/router` 22.0.7: a config `redirectTo`
  (`/redir` → `/glass`) stays one navigation (`start#1 /redir` → `end#1 /glass`), while a guard
  returning a `UrlTree` cancels and re-issues (`start#1 /guarded` → `start#2 /glass` →
  `end#2 /glass`). So the id rule covers config-redirecting first loads and, deliberately, not
  guard-redirected ones (Non-goals).
- **Q-1 (resolved at plan time):** can `router.navigated` or `lastSuccessfulNavigation()`
  identify the initial navigation from inside the `NavigationEnd` subscriber? **No.**
  `@angular/router` 22.0.7 `_router-chunk.mjs:3916-3917` sets
  `lastSuccessfulNavigation` *before* `events.next(new NavigationEnd(...))`, so both are
  already flipped to the current navigation when subscribers run. Recorded in Architecture as
  a rejected alternative; the issue asked for exactly this to be pinned before relying on it.
- **Q-2 (resolved at plan time):** does the Vitest `TestBed` run an initial navigation, so that
  a "skip the first `NavigationEnd`" rule would break the existing specs? **Yes it would** —
  probed: with bare `provideRouter`, `router.navigated` is `false` and no `NavigationEnd` has
  been emitted when the fixture is created, so a spec's own `router.navigate(...)` *is* the
  first one. This is why the rule compares URLs instead of counting navigations, and why
  AC-1 navigates to `/` (a real router navigation whose `urlAfterRedirects` is `/`, matching
  the seed) rather than pushing a synthetic event into `router.events`.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice touches only the Angular shell's overlay
visibility; no booking, beach-map, or `availability` code path is read or written.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

### Module ownership (§4a)

N/A — frontend-only; no backend capability is added or moved.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `frontend/src/app/app.ts` | existing | standalone shell component | Signals; one private non-signal field (`overlayNavId`) written by the overlay-open handlers and read by the `NavigationEnd` subscriber — bookkeeping nothing renders, so a signal would add reactivity no template reads | none |
| FE-2 | `frontend/src/app/app.spec.ts` | existing | Vitest spec | — | — |
| FE-3 | `frontend/e2e/support/shell.ts` | existing | Playwright helper | — | — |

**Standards:** standalone component, `inject()`, no decorator host bindings, one-line inline
comments (RV-STYLE-1). Deviation: none.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** `review gate — F-1 fixed, re-entering CI before the Sonar gate`

**Next action:** confirm CI green on the F-1 fix push, then pull the SonarCloud new-issue +
duplication list for PR #894 per `riviera-sdlc` `references/pr-gates.md` §2.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Keep overlays open on the navigation they were opened during | ✅ | `e5f26bd`, F-1 fix in (this commit) |
| 1 — Re-point the e2e helper's header comment | ✅ | `c42a25e`, corrected in (this commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review gate (`/code-review` high — two independent agents reproduced it) | The URL-equality guard swallows a close the guest asked for. Deep-linked to `/booking/ABC` with the chunk in flight, they open Find a booking and submit `ABC`: `router.navigate` is not same-URL-ignored (nothing has completed for `currentUrlTree` to match), so it supersedes, resolves `navigated === true`, and ends on `/booking/ABC` — equal to the seed. The shell skips the close, and `find-booking.ts:191` has no self-close on that branch, so the modal freezes on "Opening…" with the focus trap holding focus in a dead dialog (the WCAG 2.4.3 hand-off #148 established) | fixed — guard re-cut on navigation identity; pinned by AC-7, proven red against the withdrawn rule |
| F-2 | review gate | Three claims in the rewritten `e2e/support/shell.ts` header were wrong: `awaitRoutedPage` does not cover the post-sign-in redirect (`customer-password.e2e.ts:57-58` awaits that itself), "no longer closes overlays on the initial navigation" is over-broad for guard-redirected first loads, and "asserting about the page under it" is not what the theme-picker callers assert | fixed — header restated against Q-3's probe |
| F-4 | angular.dev v22 docs (angular-cli MCP `search_documentation`) | The fix first read `router.getCurrentNavigation()`, deprecated since 20.2 in favour of the `currentNavigation` signal. The signal's documented contract — "the current Navigation when the router is navigating, null when idle" — is precisely the guard's premise, so the swap also documents the rule | fixed — reads `router.currentNavigation()?.id`; the 35 shell specs stay green |
| F-3 | review-fix guard run | Two of the new spec comments were multi-line inline comments (RV-STYLE-1) | fixed — both cut to one line; `check-inline-comments.mjs` clean |

---

## File structure

- `docs/plans/shell-overlay-initial-navigation.md` — this plan.
- `frontend/src/app/app.ts` — the shell: record the in-flight navigation as an overlay is raised, guard the close-on-navigation subscription on it.
- `frontend/src/app/app.spec.ts` — the AC-1 keep-open and AC-7 supersede specs, plus a `''` test
  route whose chunk a spec lands on demand (the interactive-header window).
- `frontend/e2e/support/shell.ts` — header comment re-pointed at the test's own precondition (AC-5).

---

## Phase 0 — Keep overlays open on a same-URL navigation

**Files:** Modify `frontend/src/app/app.ts` · Test `frontend/src/app/app.spec.ts`

- [x] **Step 1: Write the failing test** — add a `''` route to `surfaceRoutes`, then:

```ts
it('keeps an overlay open when the initial navigation lands on the URL the shell already shows (#892)', async () => {
  const { fixture, el } = shell();
  const router = TestBed.inject(Router);

  el.querySelector<HTMLButtonElement>('[data-testid="find-open"]')!.click();
  fixture.detectChanges();
  await fixture.whenStable();
  const focused = document.activeElement;
  expect(el.querySelector('app-find-booking')).not.toBeNull();

  // The shape of the initial lazy-load navigation: it ends on the URL the shell loaded at.
  await router.navigate(['/']);
  fixture.detectChanges();

  expect(el.querySelector('app-find-booking')).not.toBeNull();
  expect(document.activeElement).toBe(focused);
});
```

- [x] **Step 2: Run it, verify it fails** — `npx ng test --no-watch --include="src/app/app.spec.ts"`
  → FAIL: `expected null not to be null` (the subscription closed the modal).

- [x] **Step 3: Minimal implementation** in `app.ts`:

```ts
private readonly location = inject(Location);
/** The URL the shell is showing; seeded from the document so a deep-linked first load counts too. */
private shownUrl = this.router.serializeUrl(this.router.parseUrl(this.location.path(true)));
```

and in the subscription:

```ts
.subscribe((event) => {
  // Only a navigation that changes the URL closes the overlays — the initial lazy-load
  // navigation lands on the URL already shown and must not shut a just-opened menu.
  if (event.urlAfterRedirects === this.shownUrl) {
    return;
  }
  this.shownUrl = event.urlAfterRedirects;
  ...
});
```

- [x] **Step 4: Run it, verify it passes** — `npx ng test --no-watch --include="src/app/app.spec.ts"` → PASS,
  with the `#148` and `#351` close-on-navigation specs still green (AC-2, AC-3).

> Scope (end-of-phase regression): the whole `app.spec.ts` file, plus `app.a11y.spec.ts` /
> `app.contrast.spec.ts` if either renders the shell.

- [x] **Step 5: Generalization-audit pass** — population: every `NavigationEnd` subscriber in the
  frontend (the mechanism that can fire on the initial navigation).

- [x] **Step 6: Commit** — `git commit -m "Keep shell overlays open across the initial navigation (#892)"`

- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Re-point the e2e helper's header comment

**Files:** Modify `frontend/e2e/support/shell.ts`

- [x] **Step 1: No new test** — AC-5 is a comment/API-shape criterion; the proof that the helper
  still works is the mocked suite staying green (AC-4 included).

- [x] **Step 2: Edit** the header so it states the wait is the spec's own precondition (the routed
  page must be in the outlet before its trigger is clicked) and still covers the post-sign-in
  redirect, and drop the sentence describing the app closing overlays it opened in that window.

- [x] **Step 3: Run** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y`
  scoped to `find-a-booking.e2e.ts` + `theme-shell.e2e.ts` → PASS (AC-4).

- [x] **Step 4: Commit** — `git commit -m "Re-point the e2e shell helper's header at the test precondition (#892)"`

- [x] **Step 5: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated.

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-02 | review fix F-1 | Everything that depends on the shell's `NavigationEnd` close firing (the contract F-1 broke), rather than everything that subscribes to it | `grep -rn "shell closes\|shell won't close\|closes the modal\|NavigationEnd" frontend/src --include=*.ts` | `find-booking.ts:186,191` + its spec at `find-booking.spec.ts:286` — the only dependant | None needed. The id rule restores the `navigated === true` contract `find-booking.ts:191` states, so no dependant changes; recorded because the URL rule would have required editing that file |
| 2026-09-02 | phase 0 (#892 fix) | Every frontend subscriber to the router's `NavigationEnd` — the mechanism that also fires for the initial navigation and can therefore act on something the user did not do | `grep -rn "NavigationEnd\|router.events\|lastSuccessfulNavigation" frontend/src --include=*.ts \| grep -v ".spec.ts"` | 6 subscriptions: `app.ts` (routeChrome + the overlay close), `admin-console.ts` (×2), `admin-console-tabs.ts`, `operator-chrome.ts`, `operator-console.ts` | Fixed 1. The other five are pure derivations of the current route (active tab, current url, chrome flags) that the initial navigation *should* update; only the overlay close tears down transient UI the user opened, so the population of the defect is one |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** Run `npx ng test --no-watch --include="src/app/app.spec.ts"` → the `#892` spec passes. Verified at commit `<sha>`.
- [ ] **AC-2:** same command → the `#148` spec passes with its body unchanged (`git diff` shows no edit inside it). Verified at commit `<sha>`.
- [ ] **AC-3:** same command → the `#351` spec passes with its body unchanged. Verified at commit `<sha>`.
- [ ] **AC-4:** Run the mocked e2e for `find-a-booking.e2e.ts` → PASS. Verified at commit `<sha>`.
- [ ] **AC-5:** `git diff` on `frontend/e2e/support/shell.ts` shows the header re-pointed and `awaitRoutedPage` still exported/used. Verified at commit `<sha>`.
- [ ] **AC-6:** Run `node scripts/check-inline-comments.mjs --diff origin/main` → clean. Verified at commit `<sha>`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (or justified N/A); concurrency test present (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based (invariant #11).
- [ ] **Payment/payout** section filled (or N/A); webhooks are source of truth; idempotent; money in minor units; payout exactly-once (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10).
- [ ] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6).
- [ ] Booking codes unguessable (invariant #7).
- [ ] Flyway migration present for schema changes; invariant-enforcing constraints tested (invariant #12).
- [ ] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register (no finding row left `open` without a decision).
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone. If tooling blocked the review, that is stated in the PR and its checkbox is left unticked.
