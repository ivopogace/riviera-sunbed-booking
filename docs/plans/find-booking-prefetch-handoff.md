# Find-a-booking prefetch hand-off (avoid the double-GET 429) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed)
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A successful "Find a booking" lookup opens `/booking/:code` with **exactly one**
`GET /api/bookings/{code}` instead of two, so a valid code near the #56 rate-limit ceiling
never lands the guest on the generic "Couldn't load your booking" error.

**Architecture:** Mirror the existing `beginPayment` hand-off. `FindBooking` primes
`BookingService` with the `BookingDetail` it already fetched; `BookingView` consumes that
primed detail for the **matching** route code (one-shot) instead of re-fetching, falling
back to a fetch on a deep-link/refresh or a code mismatch. No new endpoint, no backend change.

**Persistence:** JDBC only (invariant #1). N/A — frontend-only, no tables/migrations touched.

**Source of intent:** GitHub issue #168 (follow-up from the T8 review gate #148, epic #133,
finding [5] — verdict PLAUSIBLE).

**Skills consulted:** `riviera-frontend` (placement — the prefetch hand-off stays on
`booking/booking.service.ts`, mirroring `beginPayment`; no cross-feature import, no new file),
`angular-developer` + angular-cli MCP `get_best_practices` (v22 idioms: signals, `@Service`,
`inject()`, one-shot signal consume — no `mutate`), `playwright-cli` (CI-safe mocked e2e:
assert a single GET via a request counter).

**Branch:** cloud session — designated remote branch `claude/sdlc-168-03m0dv` stands in for
`bugfix/find-booking-prefetch-handoff`.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a valid code entered in the Find modal, when the lookup succeeds and the
  view opens, then the code is fetched **once** total (the modal's lookup), and `BookingView`
  renders the booking without issuing its own GET. *Pinned by:* `FindBooking` spec
  ("primes the service and BookingView consumes it — no second lookup") + `find-a-booking.e2e.ts`
  ("finds a booking … single GET").
- [ ] **AC-2:** Given `BookingService` primed with a detail for code `X`, when `takePrefetched('X')`
  is called, then it returns that detail and a second call returns `undefined` (one-shot consume).
  *Pinned by:* `BookingService` spec ("returns the primed detail once for the matching code").
- [ ] **AC-3:** Given `BookingService` primed with a detail for code `X`, when `takePrefetched('Y')`
  is called for a different code, then it returns `undefined` and leaves the primed detail intact.
  *Pinned by:* `BookingService` spec ("ignores a primed detail for a different code").
- [ ] **AC-4:** Given no primed detail (deep-link / refresh), when `BookingView` loads a code,
  then it fetches via `getByCode` exactly as today. *Pinned by:* `BookingView` spec (existing
  fetch-path tests, unchanged) + a new ("fetches when nothing is prefetched").
- [ ] **AC-5:** Given a booking is open and the guest cancels, when the post-cancel reload runs,
  then it re-fetches from the server (never a stale prefetch). *Pinned by:* existing `BookingView`
  cancel/reload specs (unchanged, still green).

## Non-goals

- Changing the #56 rate-limit ceiling or the endpoint itself.
- Rendering a 429 distinctly in `BookingView` (the issue's *alternative* fix — the prefetch
  hand-off removes the second GET entirely, so a success-path 429 no longer occurs).
- Back-linking or any guest-booking identity change (D-6, unrelated).
- Caching lookups beyond the single navigation hand-off (no persistent client cache).

## Behavior-parity ledger (retirement / replacement slices only)

| Old-surface behavior | Verdict | How the new surface does it |
|---|---|---|
| `BookingView` fetches `getByCode` on initial `paramMap` load | changed | fetches **only** when no matching prefetch is primed; otherwise consumes the primed detail |
| `BookingView` re-fetches on a `paramMap` code change (finding [0]) | preserved | prefetch is code-matched + one-shot; a new code with no prefetch still fetches |
| `BookingView` re-fetches on post-cancel reload (`load(true)`) | preserved | refresh path never consults the prefetch (already consumed / guarded by `isRefresh`) |
| `BookingView` 404 → not-found, non-404 → failed card | preserved | unchanged — only the initial fetch is conditionally skipped |
| `FindBooking` 404/429/transport inline errors, no navigation | preserved | unchanged — priming happens only after a successful fetch, before navigate |
| `FindBooking` no-op nav (same URL) closes the modal | preserved + hardened | also discards the just-primed detail (the un-navigated view won't consume it) |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A primed detail is served for the wrong code | low | high | `takePrefetched(code)` returns the detail **only** when `detail.code === code`; else `undefined` | Claude | open |
| R-2 | A stale primed detail is served on a later navigation | low | med | one-shot consume (cleared on take); no-op-nav path discards it so nothing dangles | Claude | open |
| R-3 | Existing fetch-path behavior regresses | low | med | fetch path is the default (prefetch absent → identical to today); existing specs stay green | Claude | open |

## Open questions / Assumptions

- **Assumption:** `router.navigate` to a different URL creates `BookingView` and its `paramMap`
  subscription **synchronously within** the navigate call, so priming must precede `navigate`
  (as `beginPayment` does before `/booking/pay`). — *Owner:* Claude · *Resolves by:* phase 1 (e2e proves one GET).

### Resolved

- (none yet)

## Availability & concurrency (invariant #2)

N/A — does not affect availability. Read-only booking-detail lookup; no write to
`availability(set_id, booking_date)`, no reservation path.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. (The `payNow` hand-off is untouched.)

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `booking/booking.service.ts` | existing | `@Service` | new `prefetched` signal + `primeDetail`/`takePrefetched` | — |
| FE-2 | `booking/booking-view.ts` | existing | standalone component | consults prefetch on initial load only | — |
| FE-3 | `booking/find-booking.ts` | existing | standalone component | primes after fetch, before navigate; discards on no-op nav | Signal Forms (unchanged) |

**Standards:** signals (no `mutate`, one-shot via `set(undefined)`); `inject()`; `@Service`;
inline templates unchanged; a11y unchanged.

## FE↔BE contract

N/A — no contract change. Same `GET /api/bookings/{code}` and `BookingDetail` type; the change
is purely how many times the client calls it per navigation.

## Execution status

**Stage pointer:** PR #303 open → CI + Sonar gates → merge (user authorized "merge if green")

**Next action:** confirm PR CI green + Sonar quality gate green with its new-issue list cleared, then merge + close-out.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `BookingService` prefetch hand-off (prime/take) | ✅ | committed |
| 1 — `BookingView` consumes prefetch; `FindBooking` primes; e2e single-GET | ✅ | committed |

**Verification:** `booking.service.spec` (17), `booking-view.spec` (29), `find-booking.spec` (16),
full `booking/**` suite (204) — all green; `find-a-booking.e2e.ts` (3, incl. single-GET) green
against the mocked config; `ng lint` clean.

**Review gate:** `riviera-review-overlay` FE bank walked (RV-FE-1 ✅ Angular standards; RV-FE-2/3/4/5/6/7
➖ not in scope; RV-FE-E2E ✅ mocked/CI suite, best-practice locators, single-GET assertion; RV-PROC-1
✅ Skills consulted covers the touched surface). Independent correctness review of the six hand-off
properties (one-shot/code-match/refresh/route-change/no-op-discard/error-path) → no defects.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (RV-STYLE-1) | two newly-added inline comments ran to 2 lines | fixed pre-push (one-liners) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `booking/booking.service.ts` — add `prefetched` signal + `primeDetail(detail)` / `takePrefetched(code)`.
- `booking/booking.service.spec.ts` — prime/take one-shot + code-mismatch specs.
- `booking/booking-view.ts` — consult `takePrefetched(code)` on the initial (non-refresh) load.
- `booking/booking-view.spec.ts` — add `takePrefetched` to the stub; prefetch-consume + fetch-fallback specs.
- `booking/find-booking.ts` — prime after the successful fetch, before navigate; discard on no-op nav.
- `booking/find-booking.spec.ts` — add `primeDetail` to the stub; assert primed with the fetched detail.
- `e2e/find-a-booking.e2e.ts` — assert the success path issues exactly one `GET /api/bookings/{code}`.

---

## Phase 0 — `BookingService` prefetch hand-off

**Files:** Modify `booking/booking.service.ts` · Test `booking/booking.service.spec.ts`

- [ ] Step 1: failing specs — `primeDetail` then `takePrefetched(code)` returns detail once
  (matching code), `undefined` on the second call; a mismatched code returns `undefined` and
  leaves the primed detail.
- [ ] Step 2: run `npx vitest run src/app/booking/booking.service.spec.ts` → FAIL (methods missing).
- [ ] Step 3: implement the signal + two methods.
- [ ] Step 4: run the same → PASS.
- [ ] Step 5: generalization pass — mirror the `beginPayment`/`lastAwaitingPayment` shape.
- [ ] Step 6: commit.
- [ ] Step 7: update execution status.

## Phase 1 — `BookingView` consumes, `FindBooking` primes, e2e single-GET

**Files:** Modify `booking/booking-view.ts`, `booking/find-booking.ts`, `e2e/find-a-booking.e2e.ts` · Test the three specs

- [ ] Step 1: failing specs — `BookingView` renders a prefetched detail without calling `getByCode`;
  `FindBooking` calls `primeDetail` with the fetched detail before navigating; e2e counts one GET.
- [ ] Step 2: run the touched specs → FAIL.
- [ ] Step 3: implement — `BookingView.load(isRefresh)` consults `takePrefetched` when `!isRefresh`;
  `FindBooking.onSubmit` primes after fetch, discards on no-op nav.
- [ ] Step 4: run the touched specs + e2e → PASS.
- [ ] Step 5: generalization pass.
- [ ] Step 6: commit.
- [ ] Step 7: update execution status.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-5:** run the four touched specs + `find-a-booking.e2e.ts` → all green.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] No JPA / availability / payment / Modulith concerns (frontend-only; sections justified N/A).
- [ ] Frontend standards met; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
