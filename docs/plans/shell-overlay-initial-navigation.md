# Shell overlays survive the initial navigation — Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** The shell's close-every-overlay-on-`NavigationEnd` rule fires only for a navigation
that actually changes the URL, so the initial lazy-load navigation no longer shuts a header
overlay the user opened while the first route's chunk was still in flight.

**Architecture:** The shell remembers the URL it is currently showing — seeded at construction
from the document's own URL, normalised through the router's serializer — and skips the close
when a `NavigationEnd`'s `urlAfterRedirects` equals it. Seeding from the document URL (rather
than from `router.url`, which is `/` until the first navigation completes) makes the rule hold
for a deep-linked first load too, not only for `/`. Rejected alternatives: `event.id === 1`
(a redirecting initial navigation cancels and re-issues with a new id) and
`router.navigated` / `lastSuccessfulNavigation()` (both are already flipped for the current
navigation when subscribers see the event — verified in `@angular/router` 22.0.7, see Resolved
question Q-1).

**Persistence:** N/A — frontend-only, no schema and no backend code in scope (invariant #1 untouched).

**Source of intent:** GitHub issue #892 (follow-up recorded by PR #891's Scope notes).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — confirmed no open
PRs and no in-flight overlap, and forced the seam question "how does a unit spec produce an
initial-navigation-shaped `NavigationEnd`?" before any code) · `riviera-plan-doc` (this template
— forced the seam per AC and the rejected-alternatives note above) · `tdd` (red spec for the
new keep-open behaviour before the guard in `app.ts`; the two existing close-on-navigation
specs are the regression half) · `riviera-review-overlay` (review gate — ran at
ready-for-review) · `riviera-docs-freshness` (**ran** over `origin/main..HEAD`, see close-out)
· `riviera-frontend` (placement: the rule stays in the shell component `app.ts`, no new
`core/` service — it is shell-local state, not a cross-cutting singleton) ·
`angular-developer` + angular-cli MCP / `@angular/router` 22.0.7 sources (pinned the
`lastSuccessfulNavigation`-before-`NavigationEnd` ordering and `Location.path(true)`'s
un-normalised `''` at construction) · `riviera-local-debug` (scoped Vitest runs via
`ng test --include`, `PW_CHROMIUM_EXECUTABLE` for the mocked e2e) · `playwright-cli`
(the e2e half: `awaitRoutedPage` stays, its header comment is the only e2e change) ·
`riviera-tailwind` (N/A — no styling in scope)

**Branch:** `claude/sdlc-892-o837s0` — the cloud session's designated remote branch stands in
for `bugfix/shell-overlay-initial-navigation`.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a freshly constructed shell with the find-a-booking modal open and no
  navigation yet having moved it off the URL it loaded at, when the router completes a
  navigation whose `urlAfterRedirects` equals that URL (the initial lazy-load navigation's
  shape), then the modal is still rendered and `document.activeElement` is the element that
  held focus before the navigation. *Seam:* the `app-root` shell observed through `Router`
  navigation + rendered DOM · *Pinned by:* `app.spec.ts` › `keeps an overlay open when the
  initial navigation lands on the URL the shell already shows (#892)`
- [ ] **AC-2:** Given the find-a-booking modal is open, when the router navigates to a
  different URL, then the modal is removed and focus moves to `main` (WCAG 2.4.3) —
  unchanged behaviour. *Seam:* same as AC-1 · *Pinned by:* `app.spec.ts` › `closes the Find a
  booking modal on navigation and moves focus to main (a11y, #148)` (existing, body unchanged)
- [ ] **AC-3:** Given the signed-in account menu is open and holds focus, when the router
  navigates to a different URL, then the menu is removed and focus moves to `main` —
  unchanged behaviour. *Seam:* same as AC-1 · *Pinned by:* `app.spec.ts` › `moves focus to
  main when a navigation closes the account menu (a11y, #351)` (existing, body unchanged)
- [ ] **AC-4:** Given the find modal is open with a known booking code, when the code is
  submitted and the app navigates to `/booking/:code`, then the modal is gone from the detail
  view. *Seam:* the mocked Playwright suite against the running SPA · *Pinned by:*
  `frontend/e2e/find-a-booking.e2e.ts` › the found-code flow (existing, unchanged)
- [ ] **AC-5:** Given a reader of `frontend/e2e/support/shell.ts`, when they read its header,
  then `awaitRoutedPage` is still exported and used by every opener, and the header states
  that the wait is the test's own precondition (and still covers the post-sign-in redirect)
  rather than describing an app bug that is now fixed. *Seam:* the file's exported API +
  header comment · *Verified by:* review gate (RV-FE-E2E / RV-STYLE-1), no test asserts prose.
- [ ] **AC-6:** Given the subscription in `app.ts`, when it is read, then a single-line inline
  comment names the rule ("only a navigation that changes the URL closes the overlays").
  *Seam:* the source line · *Verified by:* `node scripts/check-inline-comments.mjs --diff
  origin/main` (RV-STYLE-1 guard) + review gate.

## Non-goals

- Changing what the close does (which overlays, the focus hand-off to `main`) — only *when* it fires.
- Covering a **redirecting** first load (`/account/register` → `/account/sign-in?mode=register`):
  the seed is the pre-redirect URL, so that navigation still closes overlays. Issue #892
  explicitly scopes the redirect shape out; it is user-reachable only in the retired-link
  compat routes.
- Removing or weakening `awaitRoutedPage` in the e2e suite (AC-5 keeps it).
- Any change to `provideRouter`'s initial-navigation feature (`enabledNonBlocking` stays —
  blocking initial navigation would trade this bug for a blank first paint).
- Backend, schema, styling, or new tokens.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — no surface is retired or replaced; one guard is added to an existing subscription.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The seed and `urlAfterRedirects` are serialised differently (`Location.path(true)` returns `''` at construction, not `'/'`), so the guard never matches and the bug is not fixed | high | high | Seed through `router.serializeUrl(router.parseUrl(...))` so both sides are `DefaultUrlSerializer` output; AC-1 fails if they disagree | claude | open |
| R-2 | The guard swallows a close it should perform (a real navigation to the same URL) | low | med | The router emits `NavigationSkipped`, not `NavigationEnd`, for a same-URL re-navigation — already relied on and pinned by the existing `#351` "activated on the page it points at" spec, which closes the popover from the link handler instead | claude | open |
| R-3 | Seeding from the document URL makes the two existing close-on-navigation specs flaky through jsdom URL carry-over between specs | med | high | Probed: Angular's TestBed platform location does not move `window.location` on `router.navigate`, so the seed is `''`→`/` in every spec; AC-2/AC-3 run unchanged as the regression proof | claude | open |
| R-4 | `inject(Location)` in the shell drags a new dependency into a component that had none | low | low | `Location` is `@angular/common`'s router-facing service already provided by `provideRouter`; no new provider, no new import in `app.config.ts` | claude | open |
| R-5 | The e2e suite's `awaitRoutedPage` masks a regression of this fix (the app-side bug could come back unnoticed) | med | med | AC-1 is the unit-level pin and does not depend on the e2e timing; the e2e wait stays for its own reasons (AC-5) | claude | open |

## Open questions / Assumptions

- **Assumption:** the shell is the right owner of "which URL am I showing" — no `core/` service
  is warranted for one component's field. — *Owner:* claude · *Resolves by:* review gate.

### Resolved

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
| FE-1 | `frontend/src/app/app.ts` | existing | standalone shell component | Signals; one private non-signal field (`shownUrl`) written from the `NavigationEnd` subscription — it is subscription-local bookkeeping, never rendered, so a signal would add reactivity nothing reads | none |
| FE-2 | `frontend/src/app/app.spec.ts` | existing | Vitest spec | — | — |
| FE-3 | `frontend/e2e/support/shell.ts` | existing | Playwright helper | — | — |

**Standards:** standalone component, `inject()`, no decorator host bindings, one-line inline
comments (RV-STYLE-1). Deviation: none.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** `plan — committed, entering implement (phase 0)`

**Next action:** write the AC-1 spec in `app.spec.ts`, run it, watch it fail on the overlay
being closed.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Keep overlays open on a same-URL navigation | | |
| 1 — Re-point the e2e helper's header comment | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `docs/plans/shell-overlay-initial-navigation.md` — this plan.
- `frontend/src/app/app.ts` — the shell: seed the shown URL, guard the close-on-navigation subscription.
- `frontend/src/app/app.spec.ts` — the AC-1 keep-open spec, plus a `''` test route so a spec can
  navigate to `/` as the first navigation.
- `frontend/e2e/support/shell.ts` — header comment re-pointed at the test's own precondition (AC-5).

---

## Phase 0 — Keep overlays open on a same-URL navigation

**Files:** Modify `frontend/src/app/app.ts` · Test `frontend/src/app/app.spec.ts`

- [ ] **Step 1: Write the failing test** — add a `''` route to `surfaceRoutes`, then:

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

- [ ] **Step 2: Run it, verify it fails** — `npx ng test --no-watch --include="src/app/app.spec.ts"`
  → FAIL: `expected null not to be null` (the subscription closed the modal).

- [ ] **Step 3: Minimal implementation** in `app.ts`:

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

- [ ] **Step 4: Run it, verify it passes** — `npx ng test --no-watch --include="src/app/app.spec.ts"` → PASS,
  with the `#148` and `#351` close-on-navigation specs still green (AC-2, AC-3).

> Scope (end-of-phase regression): the whole `app.spec.ts` file, plus `app.a11y.spec.ts` /
> `app.contrast.spec.ts` if either renders the shell.

- [ ] **Step 5: Generalization-audit pass** — population: every `NavigationEnd` subscriber in the
  frontend (the mechanism that can fire on the initial navigation).

- [ ] **Step 6: Commit** — `git commit -m "Keep shell overlays open across the initial navigation (#892)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Re-point the e2e helper's header comment

**Files:** Modify `frontend/e2e/support/shell.ts`

- [ ] **Step 1: No new test** — AC-5 is a comment/API-shape criterion; the proof that the helper
  still works is the mocked suite staying green (AC-4 included).

- [ ] **Step 2: Edit** the header so it states the wait is the spec's own precondition (the routed
  page must be in the outlet before its trigger is clicked) and still covers the post-sign-in
  redirect, and drop the sentence describing the app closing overlays it opened in that window.

- [ ] **Step 3: Run** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y`
  scoped to `find-a-booking.e2e.ts` + `theme-shell.e2e.ts` → PASS (AC-4).

- [ ] **Step 4: Commit** — `git commit -m "Re-point the e2e shell helper's header at the test precondition (#892)"`

- [ ] **Step 5: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated.

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|

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
