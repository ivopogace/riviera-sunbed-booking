# My bookings: a row with nothing left reads Refunded (#1425)

Branch: `bugfix/my-bookings-nothing-left` off `main` @ e5848ab. Issue: #1425 (triage brief + owner decision).

## Acceptance criteria

1. Given a lone `CONFIRMED` account booking whose every service day was refunded, when `GET /api/me/bookings`
   is read, then its row carries `nothingLeft: true` — `MyBookingsIT`.
2. Given a stay whose first stretch a remodel ended (`CANCELLED`, receipt outcome line) and whose second
   stretch had every day refunded, then the stay's one row carries `nothingLeft: true` (the
   `LiveRemainder.Split#nothingLeft()` rule; `StayRecord#asBooking`'s fold says `false`) — `MyBookingsIT`.
3. Given an ordinary confirmed stay, then `nothingLeft: false` — `MyBookingsIT`.
4. Given a lone booking with one day refunded and one €0-share day unrefunded, then `nothingLeft: false` — `MyBookingsIT`.
5. Given a `CONFIRMED` or `NO_SHOW` row with `nothingLeft` (summary row and `BookingDetail` row), when "My
   bookings" renders, then chip "Refunded", sub-line "Every day was refunded", no QR; ordinary rows
   unchanged — `my-bookings.spec.ts`, mocked e2e `my-bookings*.e2e.ts`.

## Modulith

No new module edge. `Bookings#findByAccountId` returns `AccountBooking` entries (sealed: `BookingRecord` |
`StayRecord`) instead of pre-folded records, so `MyBookingsService` (booking `application.view`) applies
`LiveRemainder` (booking `application.cancel`, already read by `ViewBookingService`) to a stay. All inside
`booking`.

## Read cost

Unchanged list SQL (one statement, `every_day_refunded` per row). Per stay, `LiveRemainder` asks
`RemodelReceipts#endedByRemodel` once for each stretch that is neither `CONFIRMED` nor guest-cancellable —
exactly the detail page's cost for the same stay; zero queries for a stay of only confirmed stretches.

## Risks

- `findByAccountId` has other callers (`ViewStayIT`, `CreateBookingServiceTest` fake) — adapt.
- Invariant #7: codes are never logged; no logging added.

## Execution status

- [ ] Backend: port shape + service + `MyBookingView.nothingLeft` + `MyBookingsIT`
- [ ] Frontend: model, row builder, spec, mocked e2e
- [ ] PR, review gate (high), Sonar
