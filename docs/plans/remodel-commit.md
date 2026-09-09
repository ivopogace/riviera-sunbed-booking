# Remodel commit with auto-move — the edge-orchestrated transaction, the "your spot changed" mail, the bounded free-refund exit and the persisted receipt Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** An operator whose remodel preview names only **moves** can save it: in one transaction,
under the venue-wide set lock, the layout diff is applied and every affected booking is re-seated on
its candidate set — the new `(set, date)` row claimed before the old one is released, the booking
keeping its code, price and status and gaining a moved-at stamp — with a persisted receipt the owner
can open later; the guest gets a "your spot changed" mail naming both spots, the distance and the
exit deadline, and may cancel for a **full** refund until
`min(serviceDayOpensAt, max(12:00 Europe/Tirane the day before, movedAt + 24h))` whatever tier the
policy would otherwise answer. A commit whose fresh classification differs from the preview's
`{booking id, outcome kind}` pairs by more than a vanished claim is refused `STALE_PREVIEW` with the
fresh picture; a commit naming any refund, release, decline, staff hold or block is refused in this
slice. No undo.

**Architecture:** The commit is `POST /api/venues/{venueId}/beach-map/commit` at the **platform
edge** (ADR-0020, the seat the preview took), composing the two published ports it is granted:
`venue.api.BeachMapRemodel#commit` owns the transaction — ownership, the shape checks, the venue-row
lock and the `FOR UPDATE` over every active set row, the cell-keyed diff, the disturbed sets with
their staff holds — and asks the caller's **gate** whether to proceed before writing the layout;
the root's gate calls `booking.api.RemodelClaims#commit`, which re-derives the classification under
those locks, checks the preview token, moves every booking through `availability.api.AvailabilityClaim`
(claim new, release old), stamps `moved_at`, writes the receipt and publishes `BookingMoved`. The
save's own live-claim probe still runs after the gate, so nothing the gate left behind is ever
written over. The bulk PUT becomes the same write with a gate that always proceeds, so the two
callers share one write path (`LayoutWriter`). Nothing in the transaction talks to Stripe; the mail
drains through the registry listener in `notification`. The free exit is a **refund-tier override**
in `CancellationPolicy` read off `moved_at`, with the deadline arithmetic on `BookingCutoff`.

**Persistence:** JDBC only (invariant #1). **Flyway `V52__remodel_commit.sql`:** `booking.moved_at
TIMESTAMPTZ`; `booking_cancel_reason_check` and `payout_reason_check` widened to admit
`VENUE_CHANGE`; two `booking`-owned tables — `remodel_receipt (id, venue_id, operator_id,
committed_at)` and `remodel_receipt_move (id, receipt_id, booking_id, booking_date, from_set_id,
from_row_label, from_position_no, to_set_id, to_row_label, to_position_no, rows_away,
positions_away)` — every FK indexed. New SQL: the guarded booking move (`UPDATE booking SET set_id,
moved_at WHERE id AND set_id AND status IN live`), the receipt inserts and reads, the latest move
per booking, and `hasBookings` widened to a set a receipt names — every new set-table read stays off
`set_position` itself, so `RetiredSetExclusionArchitectureTests` is untouched.

**Source of intent:** GitHub issue #1034 (parent epic #1027, revision 3 — user stories 20, 23–30).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — surfaced, all from the
code: (1) `RefundReason` has no `VENUE_CHANGE` and both V14 CHECKs are closed sets, so the reason
needs a lockstep migration plus the two exhaustive transport switches; (2) the preview token cannot
be one hash of the list — "a strict subset matches" needs per-pair membership, so the token is the
sorted set of per-pair SHA-256 digests over `bookingId:KIND`, which still never names a candidate;
(3) a removed set's old label must survive the save for the mail and the receipt, and a kept set that
is renumbered keeps its id with a new number, so the receipt snapshots both labels and the mail reads
the receipt, never the live set — the event stays the ticket's five ids; (4) `venue` cannot depend on
`booking` and the venue-wide lock is `venue`'s, so the transaction is `venue`'s and the root's
composition rides in as a gate the write asks before it writes (ADR-0020's seat); (5) `LayoutCommand`
/`SetCommand` are `venue.application`, so the commit body needs a published `LayoutCell`, converted
inside `venue`; (6) the real-backend suite has no way to read a sent mail — `MockMailer` records in
memory only — so the "move mail" leg gets a mock-profile-only, operator-gated outbox read inside
`notification`, guarded out of prod like every mock; (7) a set a moved booking left keeps history
through the receipt's `from_set_id` FK, so `BookingPresence#hasBookings` must count receipt
references or a later remove would hit the FK; (8) no open PR, `V52` is the next free number; the
sibling #1033 closed out on the epic with PR #1051 and `docs/plans/remodel-preview.md` retires in
this close-out) · `riviera-plan-doc` (this template — forced a seam per AC, the module-ownership
table for the gate, the transaction and the receipt, and the parity ledger for the PUT's rewrite
onto `LayoutWriter`) · `tdd` (the move-vs-reserve concurrency IT is written first and stays red until
phase 3; each phase red first at its named seam) · `riviera-review-overlay` (review gate — <runs at
ready-for-review>) · `riviera-docs-freshness` (<ran / N/A at close-out>) · `grilling` (the intake
questions answered from the code; the calls a colleague would make are recorded as resolved
assumptions below) · `riviera-local-debug` (clone unshallowed; system Gradle on the JDK 21 daemon
compiling on the JDK 25 toolchain; scoped `--tests`; the structural net after the port, event and
grant changes; the module tests for the root-bean blast radius; the mocked e2e via
`PW_CHROMIUM_EXECUTABLE`) · `postgres` (V52: `TIMESTAMPTZ` for `moved_at`; `BIGINT` identity PKs;
`TEXT + CHECK` reasons widened by drop-and-re-add under the same names so `BookingMigrationIT`'s
token pin keeps recognising them; every FK column indexed — `remodel_receipt(venue_id)`,
`remodel_receipt_move(receipt_id)`, `(booking_id)`, `(from_set_id)`, `(to_set_id)`; the latest-move
read takes `(booking_id)` and orders by id; the move `UPDATE` is guarded on `set_id` and status so a
lost race is a 0-row no-op) · `riviera-modulith` (`BeachMapRemodel#commit` and `RemodelClaims#commit`
join their existing `api/` ports — the same conversations, one more question each; `LayoutCell`,
`LayoutCommitOutcome`, `LayoutRejection` (the published `ReplaceRejection`) join `venue.vocabulary`;
`PreviewToken`, `RemodelCommit`, `ReceiptId`, `BookingMoveFacts` join `booking.vocabulary`;
`BookingMoved` joins `booking.events` (a record, ids only); the `RemodelGate` callback is a
`@FunctionalInterface` in `venue.api` the root implements per call — a parameter, not a bean, so
not an `spi`; the receipt tables are `booking`'s and read through a `booking` controller; the root
grant is unchanged) · `codebase-design` (one write path with a gate instead of two: the PUT is the
commit with `gate = proceed`, so `LayoutWriter` is the deep part and both services are procedure over
it; the token is a value with `of` and `covers`, two callers; the preview assembler is extracted so
the preview and the two 409s render one shape) · `domain-modeling` (`CONTEXT.md` gains **Moved
booking**, **Free exit**, **Commit receipt**, **Preview token**; no new ADR — ADR-0020 already holds
the seat, its status line records the commit) · `riviera-java-conventions` (records; sealed
outcomes; `Optional` on the reads; typed outcomes for the expected refusals and an exception for the
one impossible-under-lock claim failure, which is what rolls the layout back; the error contract —
`STALE_PREVIEW`/`REMODEL_REFUSED` carry the fresh preview as a `preview` extension the way
`SETS_IN_USE` carries `sets`; no booking code on the wire or in a log, invariant #7; one-line inline
comments) · `riviera-stripe-payments` (the free exit refunds through the existing
`BookingCancelled` → `BookingRefundListener` → `RefundPort` path with the server-computed full
amount, reason `VENUE_CHANGE` stamped on the booking and the ledger `REVERSAL`; nothing in the commit
transaction touches Stripe; no fee in this slice) · `riviera-frontend` (every operator file in
`operator/`, every guest file in `booking/`; wire types in the feature models; no new cross-feature
edge; the receipt panel is a sibling of the preview panel) · `angular-developer` + angular-cli MCP
(`get_best_practices` for the v22 workspace re-read; `search_documentation` verified: `signal`/
`computed` — the commit state, the receipt and the "past remodels" list are plain signals, the
"moves only" question a `computed` over the preview; `linkedSignal` — not adopted, no state here is
derived-then-overridden; `resource`/`httpResource` — not adopted, the commit is an imperative POST on
`firstValueFrom(HttpClient)` like every write in the editor, and the receipts list loads on a click,
not on a signal; Signal Forms — no form; `@if`/`@for` with `track` for the moves and the receipts) ·
`riviera-tailwind` (verified against tailwindcss.com: `open:` is the first-party variant for a
`<details>` in its open state, which is how the past-remodels disclosure renders its marker;
`aria-disabled:` is a first-party boolean-ARIA variant, how the busy Save renders; `motion-reduce:`
guards the panel pop; no `@apply`; the panels reuse the warn skin and the console tones, the guest
notice the existing card tones — no new token, no literal) · `playwright-cli` (the mocked suite: the
commit case and the stale re-render in `layout-editor.e2e.ts`, the moved-booking view and the
free-exit cancel in the guest e2e; the real-backend spec drives the guest booking through the real
challenge as `booking-challenge.e2e.ts` does).

**Branch:** `claude/riviera-move-reserve-concurrency-y7m2my` (the session's designated remote branch
stands in for `feature/remodel-commit`).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a venue with A1 booked by a guest on date D and A2, A3 free online sets of the
  same tier, when a commit removing A1 races an online reserve of A2 on D, then never do both the
  moved guest and the reserve hold `(A2, D)`: either the reserve wins and the commit re-ranks the
  guest to A3, or the commit wins and the reserve answers `ALREADY_TAKEN`; the guest holds exactly
  one availability row, on the set the booking now names; `(A1, D)` is free. Both orders are
  exercised. *Seam:* the root's commit orchestration + `availability.api.AvailabilityClaim#claim` ·
  *Pinned by:* `MoveVsReserveConcurrencyIT.aMoveAndAReserveNeverBothHoldTheCandidate`
- [ ] **AC-2:** Given the preview's pairs, when the token is asked whether a fresh classification is
  covered, then the same pairs match, a strict subset (a claim gone) matches, a new booking id does
  not, a changed kind does not, and a move whose candidate changed still matches. *Seam:*
  `booking.vocabulary.PreviewToken#of/#covers` · *Pinned by:* `PreviewTokenTest.*`
- [ ] **AC-3:** Given a booking moved at 15:00 `Europe/Tirane` for a service day two days out, when
  the deadline is asked, then it is 15:00 the next day (24h after the move), not noon the day before;
  a move five days out ends at noon the day before; a move three hours before the day opens ends at
  the day's open. Given a moved booking inside the LATE window before its deadline, when quoted, then
  the refund is the full amount with reason `VENUE_CHANGE`; after the deadline the tier applies;
  a CLOSED window is not cancellable; an unmoved booking is unchanged. *Seam:*
  `BookingCutoff#freeExitEndsAt` and `CancellationPolicy#quote` · *Pinned by:*
  `BookingCutoffFreeExitTest.*`, `CancellationPolicyFreeExitTest.*`
- [ ] **AC-4:** Given live bookings on the disturbed sets and a token, when `commit` runs, then a
  non-owner is refused first; a token that does not cover the fresh classification answers
  `Stale(fresh)` and writes nothing; a fresh classification with any non-move outcome answers
  `Refused(fresh)` and writes nothing; an all-move classification claims each candidate, releases
  each old row, moves each booking, stamps `moved_at`, publishes one `BookingMoved` per move with the
  five ids, writes one receipt with one row per move and answers `Applied(receiptId, moves)`; a
  candidate claim that is not `CLAIMED` throws so the caller's transaction rolls back. *Seam:*
  `booking.api.RemodelClaims#commit` with fakes · *Pinned by:* `RemodelClaimsServiceTest.commit*`
- [ ] **AC-5:** Given a layout that removes a booked set, when `BeachMapRemodel#commit` runs with a
  gate, then ownership asserts first, the shape rejections answer as the save does, the venue row
  and every set row are locked before the gate is asked, the gate sees the disturbed sets with their
  holds, a refusing gate writes nothing and spends no token, a proceeding gate applies the diff and
  advances the token; the PUT behaves exactly as before through the same writer. *Seam:*
  `venue.api.BeachMapRemodel#commit`, `venue.application.EditBeachMap#replaceLayout` with fakes ·
  *Pinned by:* `BeachMapRemodelServiceTest.*`, `LayoutWriterTest.*`, `BeachMapDiffConcurrencyIT.*`
- [ ] **AC-6:** Given the owner's session, when `POST /api/venues/{v}/beach-map/commit` carries the
  save body and a token, then a mismatching token is `409 STALE_PREVIEW` with the fresh preview and
  its token, nothing written; a token covering a superset (a guest cancelled) commits; an all-move
  commit answers `200 { receiptId, moves }`, the layout is applied, the moved booking keeps its code
  and price and names the new set, the staff daily view and the booking lookup show it there, the
  old `(set, date)` row is free and the removed set is retired; a commit whose fresh picture holds a
  refund, release, decline or block is `409 REMODEL_REFUSED` with the preview; a staff hold on a
  disturbed set is `409 STALE_PREVIEW`; a stale `set_version` is `409 STALE_WRITE`; a non-owner is
  `403`; no booking code on the wire. *Seam:* HTTP `POST /api/venues/{venueId}/beach-map/commit` ·
  *Pinned by:* `RemodelCommitIT.*`, `CrossVenueDenialIT.remodelCommitByNonOwnerIs403`
- [ ] **AC-7:** Given a committed receipt, when the owner reads
  `GET /api/venues/{v}/remodels` and `/remodels/{id}`, then the list names it newest first and the
  detail carries every move with both spots, the distance and the date; an unknown id is `404`; a
  non-owner is `403`. *Seam:* HTTP `GET /api/venues/{venueId}/remodels[/{receiptId}]` · *Pinned by:*
  `RemodelReceiptIT.*`, `CrossVenueDenialIT.remodelReceiptsByNonOwnerIs403`
- [ ] **AC-8:** Given `BookingMoved`, when the listener runs, then the mail names the guest's code,
  the venue, both spots, the distance and the free-exit deadline, is delivered through the registry
  vehicle with suppression honoured, and no code rides the event; a missing fact is abandoned and
  counted. *Seam:* `BookingMoved` → `TransactionalMailService#sendBookingMoved` · *Pinned by:*
  `BookingMovedMailListenerTest.*`, `BookingMovedMailIT.*`
- [ ] **AC-9:** Given a moved booking inside its LATE window before the deadline, when the guest
  cancels by code, then the refund is the full amount, tier `FULL`, `cancel_reason = VENUE_CHANGE`
  and the ledger reversal carries the same reason; after the deadline the venue's late share applies
  with reason `POLICY`; a booking whose window is CLOSED is refused. The view shows the move and the
  deadline. *Seam:* HTTP `POST /api/bookings/{code}/cancel`, `GET /api/bookings/{code}` · *Pinned
  by:* `FreeExitCancelIT.*`
- [ ] **AC-10:** `ModularityTests` and the structural net are green with the new event, the two port
  methods, the vocabulary and the receipt controller; `EndpointRoleGateCoverageTest` sees every new
  route gated. *Seam:* the net + the named tests · *Pinned by:* the net command in `CLAUDE.md`
- [ ] **AC-11:** Given a preview naming only moves, when the operator saves from the editor, then
  the dialog offers **Save and move** beside Back, the POST carries the preview's token, a `200`
  shows the receipt (each move, the receipt id) and the saved notice, and "Past remodels" lists the
  receipt after reload; a `409 STALE_PREVIEW` re-renders the dialog with the fresh groups, a stale
  note and the new token; a preview with any other group offers Back alone. *Seam:* the
  `LayoutEditor` DOM through the mocked `HttpTestingController` · *Pinned by:*
  `layout-editor.spec.ts` "commits…" cases, `remodel-preview-panel.spec.ts`,
  `remodel-receipt-panel.spec.ts`, their `.a11y` and `.contrast` pairs
- [ ] **AC-12:** Given a moved booking's detail, when the guest opens it, then a notice names the
  old spot, the new spot, the distance and "free cancellation until <deadline>", the cancel copy
  states the full refund, and a completed cancel reports tier `FULL`; the my-bookings row wears a
  "Spot changed" chip. *Seam:* `BookingView` / `MyBookings` DOM through the mocked
  `HttpTestingController` · *Pinned by:* `booking-view.spec.ts` "moved…" cases,
  `booking-view.contrast.spec.ts`, `my-bookings.spec.ts`
- [ ] **AC-13:** Given mocked routes, when the operator commits a moves-only remodel from the running
  SPA, then the dialog's Save posts the token, the receipt renders, axe is clean, focus lands on the
  receipt; a stale answer re-renders the dialog; then the guest's my-bookings shows the moved row and
  the booking view offers the full-refund cancel. *Seam:* the running SPA against `page.route` mocks
  · *Pinned by:* `frontend/e2e/layout-editor.e2e.ts` "commits…" cases,
  `frontend/e2e/moved-booking.e2e.ts`
- [ ] **AC-14:** Against the real backend: an operator creates a venue and a three-set row, a guest
  books A1 through the real challenge, the operator paints A1 to a gap, previews, commits; the mock
  outbox read shows a `BOOKING_MOVED` mail to the guest naming A1 → A2; the guest opens the booking,
  sees the move and the deadline, **cancels**, and is told the full refund. *Seam:* the running SPA
  against the real backend · *Pinned by:* `frontend/e2e/real-backend/remodel-move.e2e.ts`
- [ ] **AC-15:** `CONTEXT.md` defines Moved booking, Free exit, Commit receipt and Preview token;
  `RESPONSIBILITIES.md` § *Platform edge*, § `venue`, § `booking`, § `availability`,
  § `notification` describe the commit; `CLAUDE.md`'s event list counts nine with `BookingMoved`;
  ADR-0020's status records the commit. *Seam:* the docs · *Pinned by:* review (RV-PROC),
  `riviera-docs-freshness` at close-out

## Non-goals

- Refunding, releasing or declining a claim from the commit, the typed refund count and reason, the
  fee and its ledger entry, the admin refunds page (#1035, #1036): every such claim refuses the
  commit here.
- Undo of a commit.
- A drag-move gesture or set ids on the save body.
- Changing which claims the preview classifies or how (#1033 stands).
- A guest-facing list of receipts; the receipt is the operator's.
- Cancellation-mail copy changes beyond the new reason's opening line.

## Behavior-parity ledger (retirement / replacement slices only)

The bulk PUT's body moves from `BeachMapEditService#replaceLayout` onto `LayoutWriter` with a gate
that always proceeds; the request, responses and lock order are unchanged.

| Old-surface behavior | Verdict (preserved / changed / dropped) | How the new surface does it, or why it's gone |
|---|---|---|
| ownership first, then `EMPTY_LAYOUT`/`LAYOUT_TOO_LARGE`/`NO_SUCH_VENUE`/`DUPLICATE_POSITION`/`CELL_TAKEN`/`ROW_NAME_TAKEN` before any lock | preserved | `LayoutWriter#write` runs the same checks in the same order before `lockAndReadSetVersion` |
| venue row lock + token compare, then every active set row `FOR UPDATE`, then the probe | preserved | the writer's order; the gate sits between the set locks and the probe |
| `SetsInUse` naming every disturbed set with a live claim | preserved | the probe runs after the gate on the same `LiveClaims#locksOn` |
| removals first (retire with history, delete without), park colliding labels, update, insert, bump | preserved | the writer's write block, verbatim |
| `BeachMapDiffConcurrencyIT` both races | preserved | unchanged test, green on the writer |
| `retire` when the set carries a booking | changed | also when a receipt names it as a from-set — a moved booking's old spot keeps its history |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A reserve or staff mark on a candidate lands between classification and the move (invariant #2) | med | high | classification and moves run under `FOR UPDATE` on every active set row; a claim's `poolForClaim` takes `FOR KEY SHARE` and waits; a mark takes the same read; a claim that still answers other than `CLAIMED` throws and rolls the whole transaction back; `MoveVsReserveConcurrencyIT` exercises both orders | session | open |
| R-2 | A stale preview commits the wrong thing (a new claim, a changed group) | med | high | the token covers `{booking id, kind}`; re-derivation under lock; `Stale` on any uncovered pair; `RemodelCommitIT` mismatch + subset cases | session | open |
| R-3 | The old spot's label is lost when the set is renumbered or retired | med | med | the receipt row snapshots both labels and the distance; the mail and the view read the receipt, never the live set | session | open |
| R-4 | A later remove of a set a moved booking left hits the receipt FK | med | med | `hasBookings` counts `remodel_receipt_move.from_set_id`/`to_set_id`, so such a set retires; `JdbcBookingPresenceIT` case | session | open |
| R-5 | Ownership on the new venue-scoped routes (BOLA, invariant #13) | low | high | both module ports assert `VenueOwnership` first; the receipt service asserts on read; `CrossVenueDenialIT` probes commit and receipts | session | open |
| R-6 | New routes reachable by any authenticated principal | med | high | explicit OPERATOR matchers for the commit POST and the receipt GETs (ordered before the public `GET /api/venues/**`) and the mock outbox read; `EndpointRoleGateCoverageTest` | session | open |
| R-7 | `@ApplicationModuleTest` contexts fail on the new root bean or the mock outbox controller (blast radius) | high | med | `RemodelCommitService` depends only on the two already-mocked ports; `WebSliceStubs` supplies a `MockMailer`; `PayoutModuleTest` and `ReviewSubmitFlowIT` run before the push | session | open |
| R-8 | Free-exit arithmetic across noon/midnight/DST (invariants #4, #6, #10) | med | med | `BookingCutoff#freeExitEndsAt` in Tirane; `BookingCutoffFreeExitTest` pins the three arms incl. the 15:00 two-days-out case; the override never reopens CLOSED | session | open |
| R-9 | The reason CHECKs and the Java enum drift | low | med | V52 widens both under the same names; `RemodelCommitMigrationIT` inserts `VENUE_CHANGE` on both tables; the transports switch exhaustively | session | open |
| R-10 | The registry dead-letters a `BookingMoved` whose facts vanished | low | low | the listener abandons with a counter like the cancellation listener; the receipt row is written in the same transaction as the event, so the facts exist when the listener runs | session | open |
| R-11 | Error-contract drift on the two 409s | low | med | `STALE_PREVIEW`/`REMODEL_REFUSED` via `ApiProblem` with a `preview` extension shaped exactly as the preview response; `RemodelCommitIT` pins bodies; detail states the condition | session | open |
| R-12 | Booking code on the wire or in a log (invariant #7) | low | high | receipts and 409s carry booking ids; `RemodelCommitIT`/`RemodelReceiptIT` assert no `"code"`; the mock outbox read omits codes and links | session | open |
| R-13 | The console literal sweep or the focus-posture guard fails the new panels | low | low | token-only classes; `[appBusy]` on Save; `focusMover` on commit → receipt, stale → dialog, back → Save | session | open |
| R-14 | Full-suite-only failure: seeded codes/addresses colliding across ITs | med | med | every IT mints codes and emails per insert (`RC-<nanoTime>`), as F-1 of #1033 taught | session | open |

## Open questions / Assumptions

### Resolved

- **The token is a set of per-pair digests, not one hash.** "A strict subset matches" needs
  per-pair membership; one digest of the list cannot answer it without persisting the preview. Each
  pair `bookingId:KIND` is hashed (SHA-256, 12 bytes, base64url), the digests sorted and joined; a
  fresh pair is covered iff its digest is present. The candidate set is never hashed, so a re-ranked
  move still matches (the epic's reason) — plan time.
- **The transaction is `venue`'s and the root rides in as a gate.** The venue-wide set lock and the
  layout write are `venue`'s; `booking`'s commit joins that transaction from inside the gate; the
  root holds no `@Transactional`. `RemodelGate` is a functional parameter in `venue.api`, implemented
  per call by the root — not an `spi` (no bean, no module implements it) — plan time.
- **Moves happen before the layout write, and a set a moved booking left retires.** The gate runs
  between the set locks and the write; the receipt's `from_set_id` FK plus the widened
  `hasBookings` make the removed set retire, so `SetBookingFacts#setBookingInfo` keeps answering for
  it and the "old `(set, date)` row is free or the set is retired" AC holds both ways — plan time.
- **`BookingMoved` carries the ticket's five ids; the old label, the distance and the deadline are
  facts the mail reads through `BookingNotificationFacts#moveFacts`**, answered from the receipt's
  latest row for that booking plus `BookingCutoff#freeExitEndsAt` — deterministic in
  `(movedAt, bookingDate)`, so a later read gives the mail's own deadline — plan time.
- **The receipt is `booking`'s.** Its content is booking outcomes (moves now; refunds, releases and
  the reason later), it is written in the same transaction as the moves, and `venue`'s Not-My-Job
  list rejects booking facts; the read is owner-asserted through `operator`'s port like the staff
  daily view — plan time.
- **A staff hold on a disturbed set at commit time is `STALE_PREVIEW`.** A preview showing a hold
  offers no Save, so a commit with one is a race or a forged body; the fresh preview names it — plan
  time.
- **The commit body is the save body plus `previewToken`; the preview response gains
  `previewToken`.** One editor body for preview, commit and PUT — plan time.
- **The mail leg of the real-backend spec reads `MockMailer`'s outbox through a mock-profile-only,
  operator-gated `GET /api/mock-mail/booking-mails?to=`** in `notification/adapter/in`, answering
  booking-kind records without codes or links; absent under `mailer`/`smtp4dev` and, transitively
  through `MockMailerProdGuard`, under `prod` — plan time.
- **`ReplaceRejection` graduates to `venue.vocabulary` as `LayoutRejection`** so the edge maps the
  same tokens the PUT maps, with the same detail sentences pinned against the PUT — plan time.
- **A moved `PENDING_REQUEST` or `AWAITING_PAYMENT` booking moves like a confirmed one**: every live
  status holds a `BOOKED_ONLINE` row through the same claim, and the classification already ranks
  them — plan time.
- **A candidate the same save switches to walk-in still receives the move**: the pool governs new
  online reserves only (revision 3), the daily view shows the booking on the now-walk-in set — plan
  time.

## Availability & concurrency (invariant #2)

- **Write paths to `availability(set_id, booking_date)`:** the move — `AvailabilityClaim#claim` on
  `(candidate, date)` **before** `AvailabilityClaim#release` on `(old set, date)`, inside `booking`'s
  commit, inside `venue`'s transaction. Both through the existing port; `availability` gains no
  writer and no listener. Every other path is unchanged (online reserve, staff mark, cancel release,
  weather refund, request hold and its three releases).
- **Uniqueness guarantee:** `set_availability_uniq UNIQUE (set_id, booking_date)` (V4), untouched;
  the claim is the `INSERT … ON CONFLICT DO NOTHING`.
- **Concurrency strategy:** the venue row `FOR UPDATE` then every active set row `FOR UPDATE` (the
  save's order, no new lock edge) before the classification is re-derived; a racing reserve's
  `poolForClaim` (`FOR KEY SHARE`) and a racing staff mark's gate read wait on those rows, so under
  the lock the candidate pool is committed truth. A claim that still fails throws; the transaction
  — layout, moves, receipt, event — rolls back whole. The preview is advisory; the token binds
  outcome kinds, never candidates, so a candidate taken in between re-ranks rather than refuses.
- **Pool rule (invariant #3):** a candidate is `ONLINE`-pool at classification (`MoveRanking`); the
  claim re-checks the pool under its own lock.
- **Cutoff rule (invariant #4):** unchanged for sales; the free exit is a cancellation-window
  override bounded by `serviceDayOpensAt` (ADR-0005's CLOSED fence never reopens).
- **Pinning test:** `MoveVsReserveConcurrencyIT.aMoveAndAReserveNeverBothHoldTheCandidate`;
  `BeachMapDiffConcurrencyIT` still pins the save's two races through the shared writer.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Tables it writes | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `set_position`, `venue.set_version` | owns the layout write and the venue-wide set lock; asks the gate |
| M-2 | `booking` | existing | `booking` (`set_id`, `moved_at`, `cancel_reason`), `remodel_receipt`, `remodel_receipt_move` | owns the lifecycle, the move, the token rule, the free exit, the receipt |
| M-3 | `availability` | existing | `set_availability` (through its existing port) | the claim/release the move calls |
| M-4 | `notification` | existing | — | the "your spot changed" mail; the mock outbox read |
| M-5 | `payout` | existing | `payout_ledger_entry.reason` (`VENUE_CHANGE`, from the event) | stamps the reversal; no code change beyond the CHECK |
| M-6 | root (not a module) | existing | — | composes the two ports and implements the gate (ADR-0020) |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `venue.api` | `BeachMapRemodel#commit(OperatorId, VenueId, long expectedVersion, List<LayoutCell>, RemodelGate)` | `LayoutCell`, `RemodelGate` (`boolean proceed(List<DisturbedSet>)`), `LayoutCommitOutcome` (sealed: `Committed`, `Refused`, `SetsInUse(List<DisturbedSet>)`, `Rejected(LayoutRejection)`) | root |
| NI-2 | `booking.api` | `RemodelClaims#commit(OperatorId, VenueId, Collection<SetId>, PreviewToken)` | `PreviewToken`, `RemodelCommit` (sealed: `Applied(ReceiptId, List<RemodelClaim>)`, `Stale(List<RemodelClaim>)`, `Refused(List<RemodelClaim>)`), `ReceiptId` | root |
| NI-3 | `booking.api` | `BookingNotificationFacts#moveFacts(BookingId)` | `BookingMoveFacts` | `notification` |
| NI-4 | `availability.api` | `AvailabilityClaim#claim/#release` (existing) | `ClaimOutcome` | `booking` |

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| EV-1 | `BookingMoved` | `booking` | `{ bookingId, venueId, fromSetId, toSetId, bookingDate }` | `notification` | async `AFTER_COMMIT` (registry) | `RemodelClaimsServiceTest.commitPublishesOneBookingMovedPerMove`, `BookingMovedMailIT` |
| EV-2 | `BookingCancelled` (existing) | `booking` | + `reason = VENUE_CHANGE` | `payout`, `notification`, `booking` | unchanged | `FreeExitCancelIT` |

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Lock the venue and every set row, diff, ask the gate, write the layout | `venue` | `venue` Job: the beach map and its layout writes; **not** the root (a rule growing at the root belongs in a module — § *Platform edge*) |
| Whether the preview still describes the claims (the token) | `booking` | a choice over booking outcomes; two callers (mint at preview, compare at commit) — `PreviewToken` in `booking.vocabulary`, minted by the edge from `booking`'s answer |
| Re-derive the classification under lock, move each booking, stamp `moved_at` | `booking` | `booking` Job: the lifecycle; **not** `venue` (Not-My-Job: bookings) |
| Claim the new row, release the old | `availability` (called by `booking`) | the only writer of `set_availability`; the existing synchronous port |
| The free-exit deadline and the tier override | `booking` (`BookingCutoff`, `CancellationPolicy`) | `booking` Job: the cancellation/refund **policy** (invariant #10); **not** `payment` |
| Stamp `VENUE_CHANGE` on the ledger reversal | `payout` (from the event) | already reads `reason` off `BookingCancelled` |
| The receipt: write with the moves, read for the owner | `booking` | booking outcomes in the moves' transaction; owner-asserted via `operator` |
| The "your spot changed" mail and its facts | `notification` (mail) / `booking` (facts) | the settled split: `notification` renders, `booking` answers facts by id |
| The mock outbox read | `notification` | the recorded mails are `notification`'s; mock-profile-only like `MockMailer` |
| Compose the ports, implement the gate, map outcomes to HTTP | root | ADR-0020 |
| Assert the actor owns the venue | `venue`, `booking` services | invariant #13, in the application service |

## Payment & payout (invariants #5, #8, #9, #10)

- **Model:** collect-only via Stripe, **no Connect**; payout via manual BKT batch. Unchanged.
- **Confirmation trigger:** unchanged; the commit confirms nothing.
- **Idempotency:** the free-exit refund rides the existing `BookingCancelled` →
  `BookingRefundListener` → `RefundPort` path with its booking-keyed idempotency; the ledger's
  `UNIQUE (booking_id, entry_type)` gives one reversal.
- **Money:** integer minor units, EUR; the full amount is the booking's snapshotted `amount_minor`.
- **Payout-ledger effect:** the reversal for a free-exit cancellation is the full amount with
  `reason = VENUE_CHANGE` (V52 admits it); no fee in this slice.
- **Refund policy applied:** the override turns LATE's partial-or-none into full until the bounded
  deadline; CLOSED stays closed; FREE stays full with reason `POLICY`. Server-side only.
- **Pinning tests:** `CancellationPolicyFreeExitTest`, `FreeExitCancelIT` (booking reason and
  ledger reason), `RemodelCommitMigrationIT` (both CHECKs).

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/operator-console.model.ts` / `.service.ts` | existing | model + `@Service` | `previewToken` on `RemodelPreview`; `RemodelCommitResult`, `RemodelReceipt`; `commitLayout`, `remodelReceipts`; `layoutErrorOf` gains `STALE_PREVIEW`/`REMODEL_REFUSED`; `remodelPreviewOf(error)` | — |
| FE-2 | `operator/remodel-preview-panel.ts` + `.html` | existing | `alertdialog` | `movesOnly` computed; `stale` input; `committed` output; Save `[appBusy]` | none |
| FE-3 | `operator/remodel-receipt-panel.ts` | new | standalone component | `input.required<RemodelReceipt>()`; focuses its heading on open | none |
| FE-4 | `operator/layout-editor.ts` + `.html` | existing | standalone component | `committing`, `receipt`, `previewStale`, `receipts` signals; `commitRemodel()`; the "Past remodels" `<details>` loading on toggle | none |
| FE-5 | `booking/booking.model.ts`, `booking-view.ts` | existing | component | `move` on `BookingDetail`; the moved notice; free-exit refund copy | none |
| FE-6 | `booking/my-bookings.ts` | existing | component | `movedAt` on the summary; the "Spot changed" chip | none |

**Standards:** standalone, `inject()`, native control flow with `track`, signal state, `[appBusy]`
never `[disabled]` on the pressed control, `focusMover` on every leg — no deviation.

## FE↔BE contract

- **Changed:** `POST /api/venues/{venueId}/beach-map/preview` response gains `"previewToken": "v1.…"`.
- **New:** `POST /api/venues/{venueId}/beach-map/commit` — body `{ sets: [{ rowLabel, positionNo,
  tier, pool, price: { minorUnits, currency }, gridX, gridY }], expectedVersion, previewToken }`
  (the save body plus the token). `200`:
  ```json
  { "receiptId": 12, "committedAt": "2026-09-09T13:00:00Z",
    "moves": [{ "bookingId": 7, "bookingDate": "2026-09-20", "amount": { "minorUnits": 2000, "currency": "EUR" },
                "from": { "setId": 1, "rowLabel": "A", "positionNo": 1 }, "to": { "setId": 2, "rowLabel": "A", "positionNo": 2 },
                "rowsAway": 0, "positionsAway": 1 }] }
  ```
  Failures: `409 STALE_PREVIEW` and `409 REMODEL_REFUSED`, each with a `preview` extension shaped as
  the preview response (five groups, `keep`, `previewToken`); `409 STALE_WRITE`; `409 SETS_IN_USE`
  with `sets`; the PUT's shape codes; `403 NOT_VENUE_OWNER`; `404 NO_SUCH_VENUE`; `400 INVALID_REQUEST`.
- **New:** `GET /api/venues/{venueId}/remodels` → `[{ receiptId, committedAt, moveCount }]` newest
  first; `GET /api/venues/{venueId}/remodels/{receiptId}` → `{ receiptId, committedAt, moves: [as
  above] }`; `404 NO_SUCH_RECEIPT`.
- **Changed:** `GET /api/bookings/{code}` gains `"move": { "fromRowLabel", "fromPositionNo",
  "rowsAway", "positionsAway", "movedAt", "freeExitUntil" } | null`; `refundIfCancelledNow` is the
  full amount while the exit is open. `GET /api/me/bookings` items gain `"movedAt": … | null`.
  `cancelReason` may now be `VENUE_CHANGE`.
- **Mock only:** `GET /api/mock-mail/booking-mails?to=` → `[{ kind, venueName, bookingDate, from,
  to, rowsAway, positionsAway, freeExitUntil }]` (operator-gated, absent outside the mock profile).
- **Client typing:** hand-written types in the two feature models; no `as any`.
- **Money/date on the wire:** minor units + currency; ISO `YYYY-MM-DD`; instants ISO-8601 UTC.

## Execution status

**Stage pointer:** `plan — doc committed; implement (phase 0) next`

**Next action:** write `MoveVsReserveConcurrencyIT` (red), then V52 and `VENUE_CHANGE`.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the concurrency IT (red), V52, `VENUE_CHANGE`, the migration IT | | |
| 1 — `booking`: token, free exit, move, receipts, `BookingMoved`, `commit` | | |
| 2 — `venue`: `LayoutCell`, `LayoutWriter`, `BeachMapRemodel#commit` | | |
| 3 — the edge: commit service + controller, assembler, receipts controller, security, ITs, the net | | |
| 4 — `notification`: the moved mail, `moveFacts`, the mock outbox read | | |
| 5 — the guest view and the free-exit cancel at the HTTP seam | | |
| 6 — the editor: model, service, panel Save, receipt panel, past remodels, specs | | |
| 7 — the guest: moved notice, free-exit copy, my-bookings chip, specs | | |
| 8 — the mocked e2e + the real-backend spec | | |
| 9 — docs; close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `platform/src/main/resources/db/migration/V52__remodel_commit.sql` — moved_at, the two CHECKs, the receipt tables (new)
- `platform/src/main/java/ai/riviera/platform/booking/vocabulary/RefundReason.java` — `VENUE_CHANGE`
- `platform/src/main/java/ai/riviera/platform/booking/vocabulary/PreviewToken.java` — (new)
- `platform/src/main/java/ai/riviera/platform/booking/vocabulary/RemodelCommit.java` — sealed (new)
- `platform/src/main/java/ai/riviera/platform/booking/vocabulary/ReceiptId.java` — (new)
- `platform/src/main/java/ai/riviera/platform/booking/vocabulary/BookingMoveFacts.java` — (new)
- `platform/src/main/java/ai/riviera/platform/booking/events/BookingMoved.java` — (new)
- `platform/src/main/java/ai/riviera/platform/booking/api/RemodelClaims.java` — `commit`
- `platform/src/main/java/ai/riviera/platform/booking/api/BookingNotificationFacts.java` — `moveFacts`
- `platform/src/main/java/ai/riviera/platform/booking/api/package-info.java` — Javadoc
- `platform/src/main/java/ai/riviera/platform/booking/events/package-info.java` — Javadoc
- `platform/src/main/java/ai/riviera/platform/booking/package-info.java` — Javadoc
- `platform/src/main/java/ai/riviera/platform/booking/application/BookingCutoff.java` — `freeExitEndsAt`
- `platform/src/main/java/ai/riviera/platform/booking/application/Bookings.java` — `moveToSet`, `cancelConfirmed(reason)`
- `platform/src/main/java/ai/riviera/platform/booking/application/cancel/CancellationPolicy.java` — the override
- `platform/src/main/java/ai/riviera/platform/booking/application/cancel/CancelBookingService.java` — the reason
- `platform/src/main/java/ai/riviera/platform/booking/application/view/BookingRecord.java` — `movedAt`
- `platform/src/main/java/ai/riviera/platform/booking/application/view/BookingDetail.java` — `move`
- `platform/src/main/java/ai/riviera/platform/booking/application/view/BookingMove.java` — (new)
- `platform/src/main/java/ai/riviera/platform/booking/application/view/ViewBookingService.java` — the move
- `platform/src/main/java/ai/riviera/platform/booking/application/view/MyBookingSummary.java` — `movedAt`
- `platform/src/main/java/ai/riviera/platform/booking/application/view/MyBookingsService.java` — `movedAt`
- `platform/src/main/java/ai/riviera/platform/booking/application/remodel/RemodelClaimsService.java` — `commit`
- `platform/src/main/java/ai/riviera/platform/booking/application/remodel/RemodelReceipts.java` — the port (new)
- `platform/src/main/java/ai/riviera/platform/booking/application/remodel/RemodelReceipt.java` — (new)
- `platform/src/main/java/ai/riviera/platform/booking/application/remodel/ReceiptMove.java` — (new)
- `platform/src/main/java/ai/riviera/platform/booking/application/remodel/ViewRemodelReceipts.java` — the port (new)
- `platform/src/main/java/ai/riviera/platform/booking/application/remodel/RemodelReceiptService.java` — (new)
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcBookings.java` — the move, `moved_at`, the reason
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcRemodelReceipts.java` — (new)
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcBookingPresence.java` — `hasBookings`
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcBookingNotificationFacts.java` — `moveFacts`
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/RemodelReceiptController.java` — (new)
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/RemodelReceiptView.java` — (new)
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/BookingDetailView.java` — `move`
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/MyBookingView.java` — `movedAt`
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/LayoutCell.java` — (new)
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/LayoutCommitOutcome.java` — sealed (new)
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/LayoutRejection.java` — moved from `application.ReplaceRejection`
- `platform/src/main/java/ai/riviera/platform/venue/api/BeachMapRemodel.java` — `commit`
- `platform/src/main/java/ai/riviera/platform/venue/api/RemodelGate.java` — (new)
- `platform/src/main/java/ai/riviera/platform/venue/api/package-info.java` — Javadoc
- `platform/src/main/java/ai/riviera/platform/venue/application/ReplaceRejection.java` — removed (moved)
- `platform/src/main/java/ai/riviera/platform/venue/application/ReplaceLayoutOutcome.java` — `LayoutRejection`
- `platform/src/main/java/ai/riviera/platform/venue/application/LayoutWriter.java` — (new)
- `platform/src/main/java/ai/riviera/platform/venue/application/LayoutWrite.java` — sealed (new)
- `platform/src/main/java/ai/riviera/platform/venue/application/BeachMapEditService.java` — delegates to the writer
- `platform/src/main/java/ai/riviera/platform/venue/application/BeachMapPreviewService.java` — renamed to `BeachMapRemodelService`
- `platform/src/main/java/ai/riviera/platform/venue/application/BeachMapRemodelService.java` — preview + commit (new)
- `platform/src/main/java/ai/riviera/platform/venue/application/LayoutCommand.java` — `of(List<LayoutCell>)`
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/VenueAdminController.java` — `LayoutRejection`
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/BeachMapLayoutRequest.java` — `LayoutRejection` import if any
- `platform/src/main/java/ai/riviera/platform/notification/application/Mailer.java` — `sendBookingMoved`
- `platform/src/main/java/ai/riviera/platform/notification/application/BookingMovedMail.java` — (new)
- `platform/src/main/java/ai/riviera/platform/notification/application/TransactionalMailService.java` — `sendBookingMoved`
- `platform/src/main/java/ai/riviera/platform/notification/adapter/in/BookingMovedMailListener.java` — (new)
- `platform/src/main/java/ai/riviera/platform/notification/adapter/in/MockMailOutboxController.java` — (new)
- `platform/src/main/java/ai/riviera/platform/notification/adapter/out/MockMailer.java` — the kind
- `platform/src/main/java/ai/riviera/platform/notification/adapter/out/SentEmail.java` — the kind
- `platform/src/main/java/ai/riviera/platform/notification/adapter/out/SmtpMailer.java` — the kind, the reason arm
- `platform/src/main/java/ai/riviera/platform/shared/ObservabilityMetrics.java` — `MAIL_MOVE_ABANDONED`
- `platform/src/main/java/ai/riviera/platform/RemodelCommitController.java` — (new)
- `platform/src/main/java/ai/riviera/platform/RemodelCommitService.java` — the gate (new)
- `platform/src/main/java/ai/riviera/platform/RemodelCommitRequest.java` — (new)
- `platform/src/main/java/ai/riviera/platform/RemodelCommitResponse.java` — (new)
- `platform/src/main/java/ai/riviera/platform/RemodelPreviewAssembler.java` — extracted (new)
- `platform/src/main/java/ai/riviera/platform/RemodelPreviewController.java` — uses the assembler
- `platform/src/main/java/ai/riviera/platform/RemodelPreviewResponse.java` — `previewToken`
- `platform/src/main/java/ai/riviera/platform/SecurityConfig.java` — the matchers
- `platform/src/test/java/ai/riviera/platform/MoveVsReserveConcurrencyIT.java` — AC-1 (new)
- `platform/src/test/java/ai/riviera/platform/RemodelCommitIT.java` — AC-6 (new)
- `platform/src/test/java/ai/riviera/platform/CrossVenueDenialIT.java` — AC-6, AC-7
- `platform/src/test/java/ai/riviera/platform/EndpointRoleGateCoverageTest.java` — if a permitAll entry is needed
- `platform/src/test/java/ai/riviera/platform/WebSliceStubs.java` — `MockMailer`
- `platform/src/test/java/ai/riviera/platform/booking/RemodelCommitMigrationIT.java` — V52 (new)
- `platform/src/test/java/ai/riviera/platform/booking/RemodelReceiptIT.java` — AC-7 (new)
- `platform/src/test/java/ai/riviera/platform/booking/FreeExitCancelIT.java` — AC-9 (new)
- `platform/src/test/java/ai/riviera/platform/booking/vocabulary/PreviewTokenTest.java` — AC-2 (new)
- `platform/src/test/java/ai/riviera/platform/booking/application/BookingCutoffFreeExitTest.java` — AC-3 (new)
- `platform/src/test/java/ai/riviera/platform/booking/application/cancel/CancellationPolicyFreeExitTest.java` — AC-3 (new)
- `platform/src/test/java/ai/riviera/platform/booking/application/cancel/CancelBookingServiceTest.java` — the reason
- `platform/src/test/java/ai/riviera/platform/booking/application/cancel/CancellationPolicyTermsTest.java` — fakes
- `platform/src/test/java/ai/riviera/platform/booking/application/remodel/RemodelClaimsServiceTest.java` — AC-4
- `platform/src/test/java/ai/riviera/platform/booking/application/view/ViewBookingServiceTest.java` — the move
- `platform/src/test/java/ai/riviera/platform/booking/adapter/out/JdbcRemodelReceiptsIT.java` — (new)
- `platform/src/test/java/ai/riviera/platform/booking/adapter/out/JdbcBookingPresenceIT.java` — the receipt reference
- `platform/src/test/java/ai/riviera/platform/booking/**/*Test.java` — fakes of `Bookings` gain the new methods
- `platform/src/test/java/ai/riviera/platform/venue/application/LayoutWriterTest.java` — AC-5 (new)
- `platform/src/test/java/ai/riviera/platform/venue/application/BeachMapPreviewServiceTest.java` — renamed
- `platform/src/test/java/ai/riviera/platform/venue/application/BeachMapRemodelServiceTest.java` — AC-5 (new)
- `platform/src/test/java/ai/riviera/platform/venue/application/VenueAdminServiceTest.java` — fakes
- `platform/src/test/java/ai/riviera/platform/venue/**/*.java` — `LayoutRejection` imports
- `platform/src/test/java/ai/riviera/platform/notification/adapter/in/BookingMovedMailListenerTest.java` — AC-8 (new)
- `platform/src/test/java/ai/riviera/platform/notification/BookingMovedMailIT.java` — AC-8 (new)
- `platform/src/test/java/ai/riviera/platform/notification/**/*.java` — fakes of `Mailer` gain `sendBookingMoved`
- `platform/src/test/java/ai/riviera/platform/payout/PayoutModuleTest.java` — if a new root dependency needs a mock
- `frontend/src/app/operator/operator-console.model.ts` — the wire types
- `frontend/src/app/operator/operator-console.service.ts` — the calls
- `frontend/src/app/operator/operator-console.service.spec.ts` — the calls
- `frontend/src/app/operator/remodel-preview-panel.ts` — Save + stale
- `frontend/src/app/operator/remodel-preview-panel.html` — Save + stale
- `frontend/src/app/operator/remodel-preview-panel.spec.ts` — AC-11
- `frontend/src/app/operator/remodel-preview-panel.a11y.spec.ts` — AC-11
- `frontend/src/app/operator/remodel-preview-panel.contrast.spec.ts` — AC-11
- `frontend/src/app/operator/remodel-receipt-panel.ts` — (new)
- `frontend/src/app/operator/remodel-receipt-panel.spec.ts` — (new)
- `frontend/src/app/operator/remodel-receipt-panel.a11y.spec.ts` — (new)
- `frontend/src/app/operator/remodel-receipt-panel.contrast.spec.ts` — (new)
- `frontend/src/app/operator/layout-editor.ts` — the commit flow
- `frontend/src/app/operator/layout-editor.html` — the receipt, the past remodels
- `frontend/src/app/operator/layout-editor.spec.ts` — AC-11
- `frontend/src/app/operator/warn-token-skin.contrast.spec.ts` — the receipt panel joins the sweep if it wears the skin
- `frontend/src/app/booking/booking.model.ts` — `move`, `movedAt`, `VENUE_CHANGE`
- `frontend/src/app/booking/booking-view.ts` — the moved notice
- `frontend/src/app/booking/booking-view.spec.ts` — AC-12
- `frontend/src/app/booking/booking-view.contrast.spec.ts` — AC-12
- `frontend/src/app/booking/my-bookings.ts` — the chip
- `frontend/src/app/booking/my-bookings.spec.ts` — AC-12
- `frontend/e2e/layout-editor.e2e.ts` — AC-13
- `frontend/e2e/moved-booking.e2e.ts` — AC-13 (new)
- `frontend/e2e/real-backend/remodel-move.e2e.ts` — AC-14 (new)
- `CLAUDE.md` — the event list
- `CONTEXT.md` — the four entries
- `RESPONSIBILITIES.md` — the five sections
- `docs/adr/ADR-0020-remodel-orchestration-at-the-composition-root.md` — the status line
- `docs/plans/remodel-preview.md` — retired
- `docs/plans/remodel-commit.md` — this plan

---

## Phase 0 — the concurrency IT (red), V52, `VENUE_CHANGE`, the migration IT

**Files:** Create `MoveVsReserveConcurrencyIT` (root test package; autowires the root
`RemodelCommitService` that does not exist yet — the slice's outer red) · Create `V52__remodel_commit.sql`
· Modify `RefundReason`, `SmtpMailer#opening`, `MockMailer` (the reason arm) · Create
`RemodelCommitMigrationIT` (moved_at present and nullable; `VENUE_CHANGE` accepted on both tables;
`remodel_receipt_move` rejects a negative distance and an orphan receipt; every FK column indexed).

- [ ] Red: `gradle test --tests "*RemodelCommitMigrationIT*"` fails on the missing column.
- [ ] Green; commit `Add the remodel-commit schema and the VENUE_CHANGE reason (#1034)`.

## Phase 1 — `booking`

**Files:** the `booking` entries above.

- [ ] `PreviewTokenTest` red → `PreviewToken` green.
- [ ] `BookingCutoffFreeExitTest` (the three arms) red → `freeExitEndsAt` green.
- [ ] `CancellationPolicyFreeExitTest` red → the override (`RefundQuote` gains `reason` and
  `freeExitUntil`) green; `CancelBookingServiceTest` pins the reason on the event and the `FULL` tier.
- [ ] `JdbcRemodelReceiptsIT` red → `JdbcRemodelReceipts` (record, list, detail, latest move) green;
  `JdbcBookingPresenceIT` pins `hasBookings` on a receipt-named set.
- [ ] `RemodelClaimsServiceTest.commit*` red → `RemodelClaimsService#commit`, `RemodelCommit`,
  `BookingMoved`, `Bookings#moveToSet` green.
- [ ] Commit `Move bookings under the venue lock: token, free exit, receipts, BookingMoved (#1034)`.

## Phase 2 — `venue`

- [ ] `LayoutWriterTest` red (the PUT's cases moved over, plus the gate's two arms) →
  `LayoutWriter`/`LayoutWrite` green; `BeachMapEditService#replaceLayout` delegates.
- [ ] `BeachMapRemodelServiceTest.commit*` red → `BeachMapRemodel#commit`, `LayoutCell`,
  `RemodelGate`, `LayoutCommitOutcome`, `LayoutRejection` green.
- [ ] `gradle test --tests "*BeachMapDiffConcurrencyIT*"` green through the writer.
- [ ] Commit `Give the layout write a gate the remodel commit asks before writing (#1034)`.

## Phase 3 — the edge

- [ ] `RemodelCommitIT` red → `RemodelCommitService`, `RemodelCommitController`, the request and
  response, `RemodelPreviewAssembler` (+ `previewToken`), the security matchers green.
- [ ] `RemodelReceiptIT` red → `RemodelReceiptController` + `RemodelReceiptService` green.
- [ ] `CrossVenueDenialIT` gains the two probes; `MoveVsReserveConcurrencyIT` green (both orders).
- [ ] The structural net + `EndpointRoleGateCoverageTest` + `PayoutModuleTest` + `ReviewSubmitFlowIT`.
- [ ] Commit `Commit the remodel at the edge: the gate, the receipt read and the move-vs-reserve race (#1034)`;
  open the draft PR.

## Phase 4 — `notification`

- [ ] `BookingMovedMailListenerTest` red → listener, `BookingMovedMail`, `Mailer#sendBookingMoved`,
  `TransactionalMailService`, `SentEmail.Kind.BOOKING_MOVED`, `moveFacts` green; `BookingMovedMailIT`
  proves the registry vehicle and suppression.
- [ ] `MockMailOutboxController` + `WebSliceStubs` + the matcher; the role-gate test green.
- [ ] Commit `Mail the guest their changed spot and expose the mock outbox for the real-backend run (#1034)`.

## Phase 5 — the guest view and the exit at the HTTP seam

- [ ] `FreeExitCancelIT` red → `ViewBookingService` (`move`, `freeExitUntil`), the two views,
  `MyBookingSummary.movedAt` green.
- [ ] Commit `Show the move and honour the free exit on the guest's booking (#1034)`.

## Phase 6 — the editor

- [ ] Specs red → model/service, panel Save + stale note, receipt panel, editor commit flow, past
  remodels; a11y + contrast pairs; `npm run lint`, `npm run format:check`, `npm test`.
- [ ] Commit `Let the operator save a moves-only remodel and read its receipt (#1034)`.

## Phase 7 — the guest

- [ ] Specs red → `booking-view` moved notice + free-exit copy, `my-bookings` chip.
- [ ] Commit `Tell the guest their spot changed and offer the free exit (#1034)`.

## Phase 8 — e2e

- [ ] `layout-editor.e2e.ts` commit + stale cases; `moved-booking.e2e.ts`; run the mocked suite.
- [ ] `real-backend/remodel-move.e2e.ts`; run it where the stack runs (recorded honestly if not).
- [ ] Commit `Drive preview → commit → mail → free-exit cancel end to end (#1034)`.

## Phase 9 — docs; close-out

- [ ] `CLAUDE.md`, `CONTEXT.md`, `RESPONSIBILITIES.md`, ADR-0020 status, Javadoc; retire
  `remodel-preview.md`; `check-plan-file-structure.mjs --diff origin/main`; the review gate; Sonar;
  `riviera-docs-freshness`; the close-out in the last code-touching commit.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-15:** filled at close-out with the commands and the commit.

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
- [ ] **Close-out written in THIS PR, in its last code-touching commit** — the plan doc's final state is committed here, citing `merged via PR #NN`, and no docs-only commit follows it.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone. If tooling blocked the review, that is stated in the PR and its checkbox is left unticked.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
