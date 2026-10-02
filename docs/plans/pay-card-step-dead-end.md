# Pay page card step never dead-ends — Implementation Plan

**Goal:** after a Payment Element mount failure, Try again re-mounts it; a rejected `confirm()`
clears `paying` and lands in the retryable error state instead of "Processing…" forever.

**Architecture:** `BookingPay` keeps one mount routine; the constructor's `afterNextRender` runs it
once (Angular runs those callbacks once, after the next render), and `pay()` runs it again when no
checkout exists — the only path when the mount never succeeded. The confirm is wrapped in
try/catch/finally: `paying` always clears, a rejection goes through `failCardStep`. Payment success
stays server-polled (#8). The pay button stays rendered and `[appBusy]` during a re-mount, so the
focused control is never destroyed (RV-FE-9).

**Source of intent:** #1286

**Branch:** `bugfix/pay-card-step-dead-end`

## Acceptance criteria

- [ ] **AC-1:** Given the mount failed and the booking is still `AWAITING_PAYMENT`, when the guest
  presses Try again, then the gateway's `mountPaymentElement` is called again and a successful
  re-mount reaches `ready`. *Seam:* `StripePaymentGateway` + the pay button ·
  *Pinned by:* `booking-pay.spec.ts` "Try again after a mount failure re-mounts…"; mocked e2e
  `request-to-book.e2e.ts` "Stripe.js fails to load: Try again re-mounts the card form, then pays".
- [ ] **AC-2:** Given a re-mount that fails again, then the page is back in the retryable error
  state with the new message. *Pinned by:* `booking-pay.spec.ts`.
- [ ] **AC-3:** Given the gateway's `confirm()` rejects, when the guest pays, then `paying` is
  false (button not busy), an error is shown, and the state is `error` (re-check run once, no
  poll). *Seam:* `StripeCheckout.confirm` · *Pinned by:* `booking-pay.spec.ts` "a rejected
  confirm…".

## Non-goals

- Any change to how success is detected (stays the `GET /api/bookings/{code}` poll, #8).
- Supplying a `return_url` for redirect-based methods (separate concern).

## Risks

- **R-1:** a re-mount racing a stale failure re-check → the re-check's subscriber applies only
  while `state === 'error'`, so it is ignored while mounting.
- **R-2:** focus stranded when the button unmounts during a re-mount (RV-FE-9) → the button stays
  rendered and busy.
- **R-3:** Stripe.js caches a failed load → `@stripe/stripe-js` 9.x `pure` resets its load promise
  on error, so a retry re-requests the script.

## Phases

- **Phase 0 — red specs:** AC-1..3 in `booking-pay.spec.ts`.
- **Phase 1 — fix:** re-mount on Try again; try/catch/finally around confirm; mocked e2e.

## Execution status

- Phase 0: done (3 specs red on main).
- Phase 1: done — fix + mocked e2e (fails on main); lint, format:check, test green locally.
