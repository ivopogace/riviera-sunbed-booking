# Console stats strip refresh on walk-in mark/release — Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** After the Daily view marks or releases a walk-in successfully, the console stats strip's
"Free today" and "Walk-ins marked" tiles show the new numbers without a reload, and no tab serves
the pre-write venue-map snapshot.

**Architecture:** A new intra-feature service `operator/availability-changes.ts`
(`AvailabilityChanges`, `@Service()`, the shape of `PendingRequestsStore`) carries the event. The
Daily view announces `{ venueId, date }` in the *success* branch of a mark/release write; the service
drops `ConsoleVenueMap`'s snapshot first (its per-set availability is now stale — the contract every
other map writer honours) and then emits on an RxJS `Subject`. The console page re-reads the shared
venue map for its `venue` signal; the strip re-reads today's held states for `held`. Events, not
state: a `Subject` (no replay) rather than a signal, so a strip mounted later never refetches on a
mark that already happened, and nothing polls. The owner fixed the trigger (the Daily view's
successful write; no polling); this plan settles the carrier: the Daily view is a child *route* in
the page's `<router-outlet>`, so an `output()` cannot be template-bound by the shell, and a re-fetch
"triggered by the shell" still needs the shell to learn of the write — a shared service is the
smallest carrier `riviera-frontend` allows (one feature → stays in `operator/`, never `core/`).

**Source of intent:** GitHub issue #1525 (related: #171 the strip, #207 walk-in count stays the exact
`STAFF_MARKED` count, #175 tap-to-mark, #486 the shared snapshot).

**Branch:** `bugfix/console-strip-refresh-on-walk-in`

## Acceptance criteria

- [ ] **AC-1:** Given the strip shows "Free today 2 / 4" and "Walk-ins marked 0" for venue 1 today,
  when the Daily view's mark of set 1 for today succeeds (204), then without a reload the strip
  re-reads today's held states and the shared map and shows "1 / 4" and "1"; a later release
  of the same set shows "2 / 4" and "0". *Seam:* the console page at `/operator/1/daily` (strip +
  Daily view through the shell). *Pinned by:* `operator-daily.e2e.ts` "marks a walk-in … strip
  follows" (mocked suite) + `daily-view-tab.spec.ts` "announces a successful mark/release".
- [ ] **AC-2:** Given a mark/release write fails (403, 409, 401, 500), when the error lands, then no
  availability change is announced — the strip never moves on a write the server refused.
  *Seam:* `AvailabilityChanges.changes`. *Pinned by:* `daily-view-tab.spec.ts` "announces nothing
  on a failed mark".
- [ ] **AC-3:** Given a change for venue 1 on today's date, when it is announced, then the strip
  re-reads `GET /api/venues/1/availability?date=today` and the walk-ins tile shows the new exact
  `STAFF_MARKED` count (#207 intact: still counted from the states read, never derived); booked
  online and takings are not re-read. *Seam:* `ConsoleStatsStrip` HTTP + DOM. *Pinned by:*
  `console-stats-strip.spec.ts` "re-reads today's held states on an announced change".
- [ ] **AC-4:** Given a change for another date (the Daily view's date picker on tomorrow) or
  another venue, when announced, then the strip issues no request and keeps its numbers. *Seam:*
  `ConsoleStatsStrip` HTTP. *Pinned by:* `console-stats-strip.spec.ts` "ignores a change for
  another day or venue".
- [ ] **AC-5:** Given the strip's refresh read fails, then the walk-ins tile shows "—" (unknown),
  never the pre-write count (the strip's standing rule: a failed read is a dash, not a phantom
  count). *Seam:* `ConsoleStatsStrip` DOM. *Pinned by:* `console-stats-strip.spec.ts` "degrades to
  a dash when the refresh read fails".
- [ ] **AC-6:** Given the console page holds venue 1's shared map, when a change for venue 1 today
  is announced, then the page re-reads `GET /api/venues/1?date=today` from the server (the snapshot
  was dropped), keeps the current map on screen until the fresh one lands (no "0 / 0" flash), and
  does not re-seed the Requests badge. *Seam:* `OperatorConsole` HTTP + strip DOM. *Pinned by:*
  `operator-console.spec.ts` "re-reads the shared map on an announced availability change".
- [ ] **AC-7:** Given `announce()` is called, then `ConsoleVenueMap`'s next `load` for the same key
  hits the server, a live subscriber receives the change, and a subscriber arriving afterwards
  receives nothing. *Seam:* `AvailabilityChanges` + `ConsoleVenueMap`. *Pinned by:*
  `availability-changes.spec.ts`.

## Non-goals

- Polling or a timer; a refresh on another operator's or the online channel's writes (a 409
  `ALREADY_TAKEN` is a *failed* mark — the Daily view already refreshes its own grid; the strip is
  left to the next successful write or a reload).
- The Daily view's other writes: a venue day refund that releases today's set changes "Free today"
  and "Booked online" the same way — a sibling of this defect, named for a follow-up issue in the
  PR's Scope notes, not widened into this slice (the owner scoped #1525 to mark/release).
- Changing the Daily view's own reconcile reads (it keeps reading server truth directly, #486 AC-3).
- Backend changes: none; no invariant's write path moves.

## Risks

- **R-1:** The console page's map refresh and the Daily view's reconcile both `GET /api/venues/1?date=today`
  when the Daily view is on today → two identical reads per tap. Accepted: the Daily view is barred
  from the snapshot by design (#486 AC-3: server truth per date), and the page's read goes through
  the snapshot so the Requests/Pricing tabs also stop serving stale availability. Noted in the PR.
- **R-2:** A late continuation after an in-place venue switch → every refresh is epoch-guarded like
  the loads it sits beside; the service's `todayAt(venueId)` filter drops a change for another venue.
- **R-3:** A refresh racing the initial load (tap before the strip's first read lands) → the two
  reads are for the same key and the last writer wins; both are server truth as of their send.
- **R-4 (#6):** "Today" is re-derived at the moment of the change, never cached from mount, so a
  console left open past Tirane midnight does not refresh yesterday's tiles for today's mark.
- **R-5 (RV-FE-8):** No new cross-feature edge: the service, both consumers and the tab are all in
  `operator/`; `ConsoleVenueMap` is already `operator/`.

## Open questions

### Resolved

- Carrier: output vs shared service vs shell re-fetch → shared `operator/` service (see Architecture);
  owner pre-decided the trigger and "no polling". — *Owner:* decided at wave intake.
- Strip refresh-failure rendering: stale count vs dash → dash, the strip's existing rule. — *Owner:* plan.

## Availability & concurrency

- **Write paths to `set_availability(set_id, booking_date)`:** unchanged — the staff mark/release
  (`availability`'s `StaffAvailabilityService`) and the online claim. This slice adds **no write**;
  it re-reads `availability`'s per-set states (`SetAvailabilityLookup#statesOn`) and `venue`'s map.
- **Concurrency strategy:** unchanged (#2 holds server-side); the SPA only reflects the committed row.
- **Pool (#3) and cutoff (#4):** untouched.
- **Pinning test:** none new on the backend; frontend ACs above.

## Phases

- **Phase 0 — the carrier:** `AvailabilityChanges.announce` drops the snapshot and emits; late
  subscriber gets nothing; `todayAt` filters by venue + today · red test `availability-changes.spec.ts`
- **Phase 1 — the Daily view announces:** success branch of mark and release announces
  `{ venueId, date }`; failure announces nothing · red tests `daily-view-tab.spec.ts` (AC-1 unit, AC-2)
- **Phase 2 — the strip follows:** re-reads held on a change for its venue today; ignores others;
  dash on failure · red tests `console-stats-strip.spec.ts` (AC-3, AC-4, AC-5)
- **Phase 3 — the page follows:** re-reads the shared map, keeps the current one meanwhile, no
  badge re-seed · red test `operator-console.spec.ts` (AC-6)
- **Phase 4 — e2e:** `operator-daily.e2e.ts` mark → strip 1 / 4 + 1; release → 2 / 4 + 0 (AC-1)

## Execution status

**Stage pointer:** `plan — committed; implement (phase 0) next`

**Next action:** red test for `AvailabilityChanges`

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the carrier | | |
| 1 — the Daily view announces | | |
| 2 — the strip follows | | |
| 3 — the page follows | | |
| 4 — e2e | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
