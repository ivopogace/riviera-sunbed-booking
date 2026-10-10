# Console venue access gate Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** A well-formed `/operator/:venueId` whose owner's read answers `403 NOT_VENUE_OWNER` or
`404 NO_SUCH_VENUE` lands on `/operator/venue-not-found` instead of mounting the console; a
transient failure (network, 5xx) and a lost session (401) behave exactly as today.

**Architecture:** A third `canActivate` guard on `operator/:venueId`, `core/venue-access.guard.ts`,
awaits the session restore, loads the console's shared beach-map snapshot (priming it, so the shell
and the tabs replay it with no extra request) and returns a `UrlTree` to the one not-found page on
the two definite codes, `true` on anything else. The snapshot (`ConsoleVenueMap`) moves from
`operator/` to `core/` — `core/` may not import a feature, and both the guard and the operator
feature need the same stateful HTTP read (`riviera-frontend` § Folder taxonomy's promotion rule).
Angular runs the guards of one array concurrently and acts on the first non-`true` in array order,
so the guard does its own `whenReady()` and never reads for a malformed id or a signed-out visitor.

**Source of intent:** issue #1526 (owner decision in its thread: one page for both outcomes, no
enumeration of which it was), PR #1570 (the owner's read: 403 before any existence probe).

**Branch:** `bugfix/console-venue-access-gate`

## Acceptance criteria

- [x] **AC-1:** Given a signed-in operator and a venue id whose owner's read answers
  `403 NOT_VENUE_OWNER`, when they navigate to any console URL under it, then the navigation ends
  on `/operator/venue-not-found` and no console component mounts. *Seam:* the route table
  (`provideRouter(routes)` + `HttpTestingController`) · *Pinned by:* `venue-access.guard.spec.ts`,
  `venue-id-route-gate.e2e.ts`
- [x] **AC-2:** Given the same, answered `404 NO_SUCH_VENUE`, then the same page, with no
  difference an operator could read. *Seam:* as AC-1 · *Pinned by:* `venue-access.guard.spec.ts`,
  `venue-id-route-gate.e2e.ts`
- [x] **AC-3:** Given the read fails transiently (5xx, network) or with 401, when the operator
  navigates, then the console mounts as today (retry alerts; the session-lost path untouched).
  *Seam:* as AC-1 · *Pinned by:* `venue-access.guard.spec.ts`, `venue-id-route-gate.e2e.ts`
- [x] **AC-4:** Given the read succeeds, then the console mounts and the snapshot is primed: the
  shell's and the tabs' first `load` make no second request. *Seam:* `ConsoleVenueMap#load` ·
  *Pinned by:* `venue-access.guard.spec.ts`
- [x] **AC-5:** Given a malformed id or a signed-out visitor, then no beach-map request is made
  and the earlier guards' redirects stand. *Seam:* as AC-1 · *Pinned by:* `venue-access.guard.spec.ts`
- [x] **AC-6:** Given the console is open on venue A, when the URL changes in place to venue B
  the operator does not own, then the not-found page. *Seam:* as AC-1 · *Pinned by:*
  `venue-access.guard.spec.ts`

## Non-goals

- A venue that vanishes while a tab is open (a `404` on a Daily-view date change): the tab keeps
  its alert; the next navigation re-runs the gate.
- An "isn't yours" wording: the owner chose one page, one wording.
- Any backend change: the owner's read already answers `403` first (invariant #13).

## Risks

- **R-1:** The guard blocks the first paint by one round trip (the console used to render
  skeletons while the map loaded) → the read is the one the shell fired anyway; the snapshot is
  primed, so nothing is fetched twice. A venue switch keeps the old venue on screen until the new
  map lands rather than flashing an empty strip.
- **R-2 (#13, enumeration):** the page must not say which outcome it was → both codes return the
  same `UrlTree`; the e2e asserts the identical card and URL for both.
- **R-3:** `core/ → operator/` import (RV-FE-8 Blocker) → the snapshot moves to `core/`; lint's
  `importBoundary` proves it.
- **R-4:** Concurrent guards: a read fired for a signed-out visitor or a malformed id → the guard
  checks `idParam` and `signedIn()` itself (AC-5).

## Open questions

### Resolved

- One page or an "isn't yours" variant? — Owner, in the issue thread: one page, no enumeration.

## Phases

- **Phase 0 — snapshot to `core/`:** `git mv` + `HttpClient` read; the moved spec stays green.
- **Phase 1 — the guard:** red `venue-access.guard.spec.ts` → `core/venue-access.guard.ts`,
  registered third on `operator/:venueId`.
- **Phase 2 — e2e:** `venue-id-route-gate.e2e.ts` gains the three outcomes.
- **Phase 3 — substrate:** `riviera-frontend` § Routing + `core/` row, `RESPONSIBILITIES.md`
  § Frontend, ADR-0023's "valid-but-unknown id is unchanged" consequence amended.

## Execution status

**Stage pointer:** `review — round 1 posted (nothing at the bar); behaviour fix (OperatorAuth drops the caches with the session) awaiting its scoped re-review`

**Next action:** re-review the fix at high, then Sonar, then remove this plan in the last commit.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — snapshot to core/ | ✅ | efc3612 |
| 1 — the guard | ✅ | (this PR) |
| 2 — e2e | ✅ | (this PR) |
| 3 — substrate | ✅ | (this PR) |
| 4 — review round 1 hygiene + OperatorAuth cache drop | ✅ | (this PR) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
