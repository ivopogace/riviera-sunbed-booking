# Pay page card step: late confirm/re-check interleaves and thrown-confirm copy

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** `BookingPay`'s card step never lets a late `confirm()` or mount write over a newer
state, applies a failure re-check's answer whenever it lands on the card step, and makes no claim
about the card after a thrown `confirm()`.

**Architecture:** One predicate, "the page has left the card step" (`confirmed`, `awaiting`,
`processing` or `terminalError()`), guards every late writer: `pay()` after its `await`,
`failCardStep`, and the re-check subscriber. A late mount sets `ready` only from `mounting`.

**Source of intent:** #1380 (agent brief + owner decision, 2026-10-02)

**Branch:** `bugfix/1380-pay-card-step-interleaves`

## Acceptance criteria

*Seam:* the `BookingPay` component, driven through `StripePaymentGateway` test doubles and
`GET /api/bookings/{code}` (`HttpTestingController`).

- [x] **AC-1:** Given a failed confirm whose re-check is in flight and a deferred second confirm,
  when the re-check answers `CONFIRMED` and then the second confirm resolves cleanly, then the page
  stays `confirmed` and no poll starts; with `CANCELLED` it stays terminal. *Pinned by:*
  `booking-pay.spec.ts` "a late clean confirm cannot …" (both variants).
- [x] **AC-2:** Given a failed mount whose re-check is in flight and a deferred re-mount, when the
  re-check answers `CONFIRMED` (or `CANCELLED`) and then the mount resolves, then the page is
  `confirmed` (or terminal), never `ready`. *Pinned by:* `booking-pay.spec.ts` "a re-check answer
  during a re-mount …" (both variants).
- [x] **AC-3:** Given `confirm()` throws, then the error lead is neutral (no "wasn't charged");
  given `confirm()` resolves `{ error }`, then the lead still says "Your card wasn't charged".
  *Pinned by:* `booking-pay.spec.ts` thrown-confirm and decline lead specs.
- [x] **AC-4:** The existing interleave specs stay green.

## Non-goals

- Polling after a thrown confirm (declined by the owner). Any backend/webhook change.
  `booking-view` (#1289).

## Risks

- **R-1 (#8):** a fix adopting success from the client → success stays adopted only from
  `GET /api/bookings/{code}`; the guards only ever *drop* a late write.
- **R-2:** a second poll → `startPolling` is reached only from the card step, unchanged.

## Payment & payout

No money moves server-side; the client never confirms (#8).

## Execution status

- [x] Phase 1: red specs for AC-1..3 (5 red on main, decline pin green), fix, lint/format/test green.
