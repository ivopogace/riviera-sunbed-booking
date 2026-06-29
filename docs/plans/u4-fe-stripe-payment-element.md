# U4-FE — Angular Stripe Payment Element: complete card payment + await webhook confirmation — Implementation Plan

> **For agentic workers:** implement with `implement` + `tdd` (installed), task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline:** this is a **frontend-only** slice, but it is the client half of
> invariant **#8** (Stripe webhooks are the source of truth — never the client redirect).
> The whole point of the slice is that the UI must **not** claim a booking is confirmed/paid
> from the Stripe.js success callback; it confirms only when the **backend** reports
> `CONFIRMED`. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Under the `stripe` profile (`POST /api/bookings` → `202 AWAITING_PAYMENT` +
`clientSecret` + `paymentIntentId`), the Angular app mounts the Stripe Payment Element,
collects the card, confirms it, and then drives the booking to a **confirmed** view **only**
after polling `GET /api/bookings/{code}` returns `CONFIRMED` (webhook-driven) — never from the
Stripe.js result. The default **stub** profile's synchronous `201 CONFIRMED` flow is unchanged.

**Architecture:** The booking POST now discriminates on **HTTP status** — `201`→ existing
confirmed handoff; `202`→ a new awaiting-payment handoff that routes to a dedicated
**`/booking/pay`** page. Stripe.js is wrapped behind an **injectable `StripePaymentGateway`
seam** (abstract-class DI token) so jsdom/vitest mock it and the real `loadStripe` adapter is
the only code that touches `js.stripe.com` (PCI: Stripe.js must load from Stripe, never be
bundled). The pay page owns the **await-confirmation poll** of `GET /api/bookings/{code}`.

**Persistence:** JDBC only (invariant #1). **N/A — no backend/DB change in this slice** (the
`202` contract, the `payment` module, and `GET /api/bookings/{code}` all already exist from
U4 #53 / U6 #57). No migration.

**Source of intent:** GitHub issue **#50** (U4-FE); backend contract from #8/#53
(`docs/plans/u4-stripe-payment-webhook.md`, D-1 deferred the FE half) and the U6 status
endpoint #57 (`docs/plans/u6-view-cancel-booking.md`).

**Skills consulted:** `riviera-stripe-payments` (FE side of invariant #8 — never trust the
Stripe.js redirect; poll the backend; publishable key only, no secret in the bundle; collect-only,
no Connect), `angular-developer` + the **angular-cli MCP** (`get_best_practices`,
`list_projects` → v22 idioms: signals/`computed`, `@Service`/`inject()`, native control flow,
abstract-class DI token, mandatory axe/WCAG-AA), `riviera-plan-doc` (this doc's discipline),
`tdd` (red-green per phase). `postgres`/`riviera-modulith`/`riviera-java-conventions` **N/A —
no Postgres or backend Java in scope.**

**Branch:** `claude/stripe-payment-element-angular-7mqlsh` (designated for this task; exists,
checked out). Slug for plan/commit references: `u4-fe-stripe-payment-element`.

---

## Acceptance criteria (testable)

> Phrased at the Angular app boundary (the inner hexagon for a FE slice): app behavior /
> handoff state / rendered state, not Stripe's internal iframe. Stripe-adapter specifics are
> asserted in the gateway/e2e adapter tests, not the core ACs.

- [ ] **AC-1 (202 routes to pay, never to confirmed):** Given `POST /api/bookings` returns
  **`202`** with a `clientSecret`, when the dialog submits, then `BookingService` exposes an
  **awaiting-payment** result and the app navigates to **`/booking/pay`** — the
  confirmed/"Paid" screen is **not** shown. *Pinned by:* `booking.service.spec.ts`
  (`discriminates 202 → awaiting`) + `booking-dialog.spec.ts` (`emits awaiting → navigates to /booking/pay`).
- [ ] **AC-2 (confirmed only after backend says so):** Given the Payment Element `confirm()`
  resolves without error, when polling `GET /api/bookings/{code}` first returns
  `AWAITING_PAYMENT` then `CONFIRMED`, then the pay page shows the **processing** state while
  `AWAITING_PAYMENT` and the **confirmed** view **only** on `CONFIRMED`. *Pinned by:*
  `booking-pay.spec.ts` (`stays processing until backend CONFIRMED`).
- [ ] **AC-3 (no false confirm on webhook lag):** Given `confirm()` succeeds client-side but
  the backend is still `AWAITING_PAYMENT` after the ~30s poll window, then the page shows a
  **"payment received — awaiting confirmation"** terminal state (never "confirmed"/"paid")
  with the booking **code** and a link to `/booking/{code}`. *Pinned by:*
  `booking-pay.spec.ts` (`webhook-lag → awaiting state, not confirmed`).
- [ ] **AC-4 (declined/abandoned → clear retry, no false confirm):** Given `confirm()`
  resolves with an **error** (declined/3DS-failed), then the page shows a clear error +
  **retry** affordance with the Payment Element still usable, and **no** confirmation and
  **no** polling started. *Pinned by:* `booking-pay.spec.ts` (`decline → retry state, no poll`).
- [ ] **AC-5 (stub profile unchanged):** Given `POST /api/bookings` returns **`201
  CONFIRMED`**, when the dialog submits, then the existing confirmation handoff + `/booking/confirmation`
  screen behave exactly as before. *Pinned by:* `booking.service.spec.ts` (existing 201 tests
  stay green) + `booking-flow.e2e.ts` (existing 201 flow stays green).
- [ ] **AC-6 (publishable key from config, no secret in bundle):** Given the build, the Stripe
  **publishable** key is read from `environment` (not hard-coded in a component) and **no**
  `sk_`/secret key string is present in the client bundle. *Pinned by:*
  `stripe-payment.gateway.spec.ts` (reads `environment.stripePublishableKey`; throws a clear
  error when empty) + a `dist` grep guard step in the phase.
- [ ] **AC-7 (a11y):** Given each new state (mounting / processing / confirmed / retry /
  awaiting), then jsdom **axe** reports no critical/serious violations and the Playwright
  **`@axe-core/playwright`** audit (Stripe **mocked**) passes. *Pinned by:*
  `booking-pay.a11y.spec.ts`, `booking-pay.contrast.spec.ts`, `booking-flow.e2e.ts` (new
  stripe-path scenario).

## Non-goals

- **No backend change.** The `202` contract, `payment` module, Stripe webhook handling, and
  `GET /api/bookings/{code}` already exist. If a gap appears, raise an issue — do not edit the
  backend here.
- **No Apple/Google Pay / wallets, no saved cards, no SEPA UI.** Card via the Payment Element
  only (the element may surface wallets if the browser offers them, but no extra wiring).
- **No Request-to-Book authorize/capture UI** (that mode is a separate slice).
- **No Stripe Connect** anything (invariant #8 / ADR-0002 — collect-only).
- **No real-Stripe e2e against live test cards** (flaky/non-deterministic in CI; the gateway
  is mocked in Playwright). Manual test-card verification is a runbook step, not CI.
- **No resume-after-hard-refresh** of an in-flight payment: the `clientSecret` handoff lives in
  in-memory `BookingService` state (consistent with the existing `lastConfirmation` handoff). A
  cold load of `/booking/pay` shows a "start over" message. (Recorded as an accepted limitation.)

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | UI claims "confirmed/paid" from the Stripe.js success callback (violates invariant #8) — the exact bug the issue calls out | high | high | The pay page renders `confirmed` **only** on a `CONFIRMED` poll of `GET /api/bookings/{code}`; the Stripe.js result only gates *start polling vs show retry*. Pinned by AC-2/AC-3. | claude | open |
| R-2 | 202 path reuses the 201 confirmation screen, so `AWAITING_PAYMENT` shows as "Booking confirmed / Paid" (the current false state) | high | high | Service discriminates on HTTP 201 vs 202; only 201 reaches `/booking/confirmation`; 202 → `/booking/pay`. Confirmation screen additionally guards on `status === 'CONFIRMED'`. AC-1/AC-5. | claude | open |
| R-3 | Webhook never lands / is delayed → infinite spinner or false confirm | med | high | Bounded ~30s poll → explicit "awaiting confirmation" terminal state with the code (AC-3), never "confirmed". | claude | open |
| R-4 | Secret key leaks into the bundle | low | high | Only the **publishable** `pk_` key, from `environment`; grep `dist` for `sk_`/secret in the phase; gateway reads env (AC-6). | claude | open |
| R-5 | Stripe.js can't run under jsdom → untestable component, or flaky CI | high | med | `StripePaymentGateway` seam: real `loadStripe` only in the browser adapter; jsdom/vitest + Playwright inject a fake. AC-7. | claude | open |
| R-6 | Overlapping poll requests / poll not stopped on destroy → leaked timers, racey tests | med | med | `switchMap` over a single `timer`, `takeUntilDestroyed`, stop on terminal state; tests use `HttpTestingController` + fake timers. | claude | open |
| R-7 | Deploy build rewrites `environment.prod.ts` wholesale (`deploy.yml`) and drops the new key | med | med | Update the `deploy.yml` printf to emit `stripePublishableKey` from a `STRIPE_PUBLISHABLE_KEY` repo variable, defaulting to the committed value. | claude | open |

## Open questions / Assumptions

- **Assumption:** Discriminate stub-vs-stripe on the **HTTP status code** (`201` vs `202`),
  not build-time config — one build serves both backends. *Owner:* claude · *Resolves by:* Phase 0.
- **Assumption:** `@stripe/stripe-js` (`loadStripe`) is the loader (PCI-compliant; loads from
  `js.stripe.com`). New FE dependency. *Owner:* claude · *Resolves by:* Phase 1.
- **Assumption:** Poll cadence **1.5s**, window **30s** before the awaiting-terminal state
  (per the issue-intake decision). *Owner:* claude · *Resolves by:* Phase 2.
- **Assumption:** Decline → **retry in place** reusing the same `clientSecret`/PaymentIntent
  (standard Stripe behavior). *Owner:* claude · *Resolves by:* Phase 2.
- **Assumption:** The publishable key is committed empty in `environment*.ts` and injected at
  deploy from `STRIPE_PUBLISHABLE_KEY`; for **local** `stripe`-profile testing it is set in a
  dev override. An empty key surfaces a clear config-error state, not a silent failure. *Owner:*
  claude · *Resolves by:* Phase 1.

### Resolved

- **Issue note "GET status endpoint is U6 — coordinate if needed sooner":** resolved — U6
  (#57) is **merged**; `GET /api/bookings/{code}` returns `status`, used for polling. (Issue-intake
  grill, 2026-06-29.)
- **Payment Element placement:** dedicated `/booking/pay` route (user decision, issue-intake grill).
- **Webhook-await timeout:** ~30s poll then "saved, awaiting confirmation" (user decision).
- **e2e scope:** jsdom axe for all states + Playwright axe with Stripe **mocked** (user decision).

## Availability & concurrency (invariant #2)

**N/A — does not affect availability.** This slice writes no `availability(set_id, booking_date)`
row and changes no claim/lock logic. The availability transition for a `stripe`-profile booking
happens **server-side** on the verified `payment_intent.succeeded` webhook (U4 #53 /
`BookingConfirmed` spine), entirely outside this frontend slice. The FE only **reads** booking
status via `GET /api/bookings/{code}`.

## Spring Modulith — modules, interfaces, events

**N/A — frontend-only.** No backend Java created or modified. No new `api/`/`spi/` ports, no new
events. The consumed surface (`POST /api/bookings` 201/202, `GET /api/bookings/{code}`) already
exists.

## Payment & payout (invariants #5, #8, #9, #10)

> Filledfromthe **frontend** perspective — this slice is the client half of the payment flow.

- **Model:** collect-only via Stripe, **no Connect** (ADR-0002). The FE mounts the Payment
  Element with the backend-issued `clientSecret`; it never creates PaymentIntents or touches
  payout.
- **Confirmation trigger (invariant #8):** the **signature-verified webhook**, observed by the
  FE **only** indirectly via `GET /api/bookings/{code}` returning `status === 'CONFIRMED'`. The
  Stripe.js `confirmPayment` result is treated as "the card step finished" — **never** as
  proof of confirmation. This is the central correctness property of the slice.
- **Idempotency:** N/A on the client (idempotency keys are the backend's job). Re-`confirm()`
  after a decline reuses the same PaymentIntent (Stripe-side idempotent).
- **Money:** integer minor units + ISO currency on the wire (invariant #5); rendered via
  `Intl.NumberFormat` from `minorUnits/100` exactly as the existing screens do. No float math.
- **Payout-ledger effect:** none from the FE (accrual happens server-side on confirm).
- **Refund policy:** N/A — this slice does not cancel/refund (U6 owns that).
- **Pinning tests:** `booking-pay.spec.ts` (confirm-then-poll; never confirm from Stripe.js),
  `stripe-payment.gateway.spec.ts` (publishable key only, no secret).

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `booking/booking.model.ts` | modify | types | — | — |
| FE-2 | `booking/booking.service.ts` | modify | `@Service` | signals (`lastConfirmation`, new `lastAwaitingPayment`) | — |
| FE-3 | `booking/stripe-payment.gateway.ts` | new | abstract DI token + `loadStripe` adapter | — | — |
| FE-4 | `booking/booking-pay.ts` (+ `.scss`) | new | standalone component, route `/booking/pay` | signals + `computed`; rxjs `timer`/`switchMap` poll; `takeUntilDestroyed` | — |
| FE-5 | `booking/booking-dialog.ts` | modify | standalone component | branch on awaiting vs confirmed | Signal Forms (unchanged) |
| FE-6 | `venue/venue-map.ts` | modify | standalone component | navigate to `/booking/pay` on awaiting | — |
| FE-7 | `booking/booking-confirmation.ts` | modify | standalone component | guard render on `status === 'CONFIRMED'` | — |
| FE-8 | `app.routes.ts` / `app.config.ts` | modify | routing / DI | provide `StripePaymentGateway` | — |
| FE-9 | `environments/environment*.ts` | modify | config | add `stripePublishableKey` | — |
| FE-10 | `.github/workflows/deploy.yml` | modify | CD | emit the key from `STRIPE_PUBLISHABLE_KEY` | — |

**Standards:** standalone components (no `standalone: true`, no explicit `OnPush`), `inject()`,
`@Service`, `@if`/`@for`, `input()`/`output()` signal APIs, `computed()` for derived state,
abstract-class DI token for the gateway, `takeUntilDestroyed` for the poll subscription. State
conveyed in **text** (not colour alone) for WCAG AA. No `as any` on the contract.

## FE↔BE contract

- **Consumed endpoints (already implemented — no change):**
  - `POST /api/bookings` → **`201`** `BookingConfirmationView` (stub) **or** **`202`**
    `AwaitingPaymentView` (stripe). `AwaitingPaymentView` = the 201 fields (`code`, `status`
    =`AWAITING_PAYMENT`, `venueId`, `venueName`, `setId`, `rowLabel`, `positionNo`,
    `bookingDate`, `amount{minorUnits,currency}`) **plus** `clientSecret` + `paymentIntentId`.
  - `GET /api/bookings/{code}` → `200` `BookingDetailView` with `status` (polled for
    `CONFIRMED`); `404` `{error:"NO_SUCH_BOOKING"}`.
- **Client typing:** hand-written typed models in `booking.model.ts` mirroring the views; the
  service reads the **HTTP status** via `observe: 'response'` to discriminate 201 vs 202. No
  `any`/`as any`.
- **Money/date on the wire:** integer minor units + ISO currency; booking date ISO `LocalDate`.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Service 201/202 discrimination + awaiting handoff (+ dialog/map wiring) | ✅ | (this commit) |
| 1 — Stripe gateway seam + env config + deploy.yml | ✅ | (this commit) |
| 2 — `/booking/pay` page (mount → confirm → poll) + confirmation guard | | |
| 3 — a11y/contrast specs + Playwright stripe-path e2e (mocked) | | |

> **Note:** the dialog `awaiting` output + `venue-map.onAwaiting()` navigation (originally
> Phase 2) were folded into Phase 0 — the service return-type change breaks the dialog
> consumer, so wiring it in the same phase keeps the tree compiling. Phase 2 now adds only the
> `/booking/pay` route + component + the confirmation-screen guard.

Legend: blank = not started, ⏳ = in progress, ✅ = done. Update in the SAME commit window as
each phase's code.

---

## File structure

- `frontend/src/app/booking/booking.model.ts` — add `AwaitingPayment` + `CreateBookingResult`
  discriminated union.
- `frontend/src/app/booking/booking.service.ts` — `createBooking` returns `CreateBookingResult`
  (reads HTTP status); add `lastAwaitingPayment` handoff signal; keep `lastConfirmation`.
- `frontend/src/app/booking/stripe-payment.gateway.ts` — abstract `StripePaymentGateway` token +
  `StripeCheckout` handle + real `StripeJsPaymentGateway` (`loadStripe`); reads
  `environment.stripePublishableKey`.
- `frontend/src/app/booking/booking-pay.ts` (+ `.scss`) — the `/booking/pay` page: mount PE,
  confirm, poll, render states.
- `frontend/src/app/booking/booking-dialog.ts` — branch booked-output on awaiting vs confirmed.
- `frontend/src/app/venue/venue-map.ts` — navigate to `/booking/pay` on awaiting.
- `frontend/src/app/booking/booking-confirmation.ts` — guard render on `status === 'CONFIRMED'`.
- `frontend/src/app/app.routes.ts` — add the `booking/pay` route (before `booking/:code`).
- `frontend/src/app/app.config.ts` — provide `StripePaymentGateway` → `StripeJsPaymentGateway`.
- `frontend/src/environments/environment.ts` / `environment.prod.ts` — add `stripePublishableKey`.
- `frontend/package.json` — add `@stripe/stripe-js`.
- `.github/workflows/deploy.yml` — emit `stripePublishableKey` from `STRIPE_PUBLISHABLE_KEY`.
- Tests: `booking.service.spec.ts` (extend), `stripe-payment.gateway.spec.ts` (new),
  `booking-pay.spec.ts` (new), `booking-pay.a11y.spec.ts` (new), `booking-pay.contrast.spec.ts`
  (new), `booking-dialog.spec.ts` (extend), `e2e/booking-flow.e2e.ts` (extend, stripe path mocked).

---

## Phase 0 — Service: 201/202 discrimination + awaiting-payment handoff

**Files:** Modify `booking.model.ts`, `booking.service.ts` · Test `booking.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// booking.service.spec.ts (additions)
const AWAITING = {
  code: 'WXYZ345678',
  status: 'AWAITING_PAYMENT',
  venueId: 1,
  venueName: 'Miramar Beach Club',
  setId: 2,
  rowLabel: 'Front row · Sea view',
  positionNo: 2,
  bookingDate: '2026-12-01',
  amount: { minorUnits: 4500, currency: 'EUR' },
  clientSecret: 'pi_123_secret_abc',
  paymentIntentId: 'pi_123',
};

it('discriminates a 201 body as a confirmed result and stores it', () => {
  let result: CreateBookingResult | undefined;
  service.createBooking(REQUEST).subscribe((r) => (result = r));
  const req = httpMock.expectOne(`${environment.apiBaseUrl}/api/bookings`);
  req.flush(CONFIRMATION, { status: 201, statusText: 'Created' });

  expect(result).toEqual({ kind: 'confirmed', confirmation: CONFIRMATION });
  expect(service.lastConfirmation()).toEqual(CONFIRMATION);
  expect(service.lastAwaitingPayment()).toBeUndefined();
});

it('discriminates a 202 body as an awaiting-payment result and stores it', () => {
  let result: CreateBookingResult | undefined;
  service.createBooking(REQUEST).subscribe((r) => (result = r));
  const req = httpMock.expectOne(`${environment.apiBaseUrl}/api/bookings`);
  req.flush(AWAITING, { status: 202, statusText: 'Accepted' });

  expect(result).toEqual({ kind: 'awaiting', awaiting: AWAITING });
  expect(service.lastAwaitingPayment()).toEqual(AWAITING);
  expect(service.lastConfirmation()).toBeUndefined();
});
```

- [ ] **Step 2: Run it, verify it fails** — `npm test -- --include='**/booking.service.spec.ts'`
  → FAIL (`createBooking` returns `BookingConfirmation`, no `kind`).

- [ ] **Step 3: Minimal implementation**

```ts
// booking.model.ts (additions)
export interface AwaitingPayment {
  readonly code: string;
  readonly status: string; // 'AWAITING_PAYMENT'
  readonly venueId: number;
  readonly venueName: string;
  readonly setId: number;
  readonly rowLabel: string;
  readonly positionNo: number;
  readonly bookingDate: string;
  readonly amount: MoneyView;
  readonly clientSecret: string;
  readonly paymentIntentId: string;
}

export type CreateBookingResult =
  | { readonly kind: 'confirmed'; readonly confirmation: BookingConfirmation }
  | { readonly kind: 'awaiting'; readonly awaiting: AwaitingPayment };
```

```ts
// booking.service.ts (createBooking rewrite)
private readonly awaiting = signal<AwaitingPayment | undefined>(undefined);
readonly lastAwaitingPayment = this.awaiting.asReadonly();

createBooking(request: CreateBookingRequest): Observable<CreateBookingResult> {
  return this.http
    .post<BookingConfirmation | AwaitingPayment>(
      `${environment.apiBaseUrl}/api/bookings`, request, { observe: 'response' })
    .pipe(
      map((response): CreateBookingResult => {
        if (response.status === 202) {
          const awaiting = response.body as AwaitingPayment;
          this.awaiting.set(awaiting);
          this.confirmation.set(undefined);
          return { kind: 'awaiting', awaiting };
        }
        const confirmation = response.body as BookingConfirmation;
        this.confirmation.set(confirmation);
        this.awaiting.set(undefined);
        return { kind: 'confirmed', confirmation };
      }),
    );
}
```

- [ ] **Step 4: Run it, verify it passes** — `npm test -- --include='**/booking.service.spec.ts'` → PASS
- [ ] **Step 5: Generalization-audit pass** — search callers of `createBooking` (`booking-dialog.ts`);
  they consume the result in Phase 2. Record.
- [ ] **Step 6: Commit** — `git commit -m "U4-FE: discriminate 201/202 booking create, add awaiting-payment handoff (#50)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Stripe gateway seam + env config + deploy.yml

**Files:** Create `stripe-payment.gateway.ts` · Modify `app.config.ts`, `environment*.ts`,
`package.json`, `.github/workflows/deploy.yml` · Test `stripe-payment.gateway.spec.ts`

The real `loadStripe` adapter cannot run under jsdom, so the **unit-testable** behavior is the
**config guard** (empty publishable key → clear error) and the **token contract**. The mount/
confirm path is exercised through a **fake** gateway in the Phase 2 component tests and the e2e.

- [ ] **Step 1: Write the failing test**

```ts
// stripe-payment.gateway.spec.ts
import { TestBed } from '@angular/core/testing';
import { StripeJsPaymentGateway } from './stripe-payment.gateway';

describe('StripeJsPaymentGateway', () => {
  it('rejects with a clear error when the publishable key is not configured', async () => {
    // environment.stripePublishableKey is '' in the dev/test environment
    const gateway = TestBed.runInInjectionContext(() => new StripeJsPaymentGateway());
    const host = document.createElement('div');
    await expect(gateway.mountPaymentElement(host, 'pi_1_secret_x')).rejects.toThrow(
      /publishable key/i,
    );
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `npm test -- --include='**/stripe-payment.gateway.spec.ts'`
  → FAIL (file does not exist).

- [ ] **Step 3: Minimal implementation**

```ts
// stripe-payment.gateway.ts
import { Injectable } from '@angular/core';
import { loadStripe, Stripe, StripeElements } from '@stripe/stripe-js';
import { environment } from '../../environments/environment';

/** A mounted Payment Element the caller can confirm. Confirm returns a UX-level result only —
 *  NEVER treated as proof of confirmation (invariant #8); the page polls the backend. */
export interface StripeCheckout {
  /** Confirm the card. `{ error }` ⇒ show retry; otherwise the card step finished and the page
   *  begins polling GET /api/bookings/{code} for CONFIRMED. No redirect. */
  confirm(): Promise<{ readonly error?: string }>;
}

/** Injectable seam over Stripe.js so jsdom/vitest + Playwright mock it (real loadStripe only here). */
export abstract class StripePaymentGateway {
  abstract mountPaymentElement(host: HTMLElement, clientSecret: string): Promise<StripeCheckout>;
}

@Injectable()
export class StripeJsPaymentGateway extends StripePaymentGateway {
  override async mountPaymentElement(host: HTMLElement, clientSecret: string): Promise<StripeCheckout> {
    const key = environment.stripePublishableKey;
    if (!key) {
      throw new Error('Stripe publishable key is not configured (environment.stripePublishableKey).');
    }
    const stripe: Stripe | null = await loadStripe(key);
    if (!stripe) {
      throw new Error('Stripe.js failed to load.');
    }
    const elements: StripeElements = stripe.elements({ clientSecret });
    elements.create('payment').mount(host);
    return {
      confirm: async () => {
        const { error } = await stripe.confirmPayment({ elements, redirect: 'if_required' });
        return error ? { error: error.message ?? 'Your payment could not be completed.' } : {};
      },
    };
  }
}
```

```ts
// environment.ts / environment.prod.ts: add to each object
stripePublishableKey: '', // pk_test_… injected at build (deploy.yml) / dev override; not a secret
```

```ts
// app.config.ts: add provider
{ provide: StripePaymentGateway, useClass: StripeJsPaymentGateway },
```

```yaml
# .github/workflows/deploy.yml — replace the apiBaseUrl-only printf so the env file carries both,
# defaulting to committed values when a var is unset.
        env:
          BACKEND_API_URL: ${{ vars.BACKEND_API_URL }}
          STRIPE_PUBLISHABLE_KEY: ${{ vars.STRIPE_PUBLISHABLE_KEY }}
        run: |
          api="${BACKEND_API_URL:-https://riviera-sunbed-booking.onrender.com}"
          pk="${STRIPE_PUBLISHABLE_KEY:-}"
          printf "export const environment = {\n  production: true,\n  apiBaseUrl: '%s',\n  stripePublishableKey: '%s',\n};\n" "$api" "$pk" > src/environments/environment.prod.ts
          echo "Wrote prod environment (apiBaseUrl=$api, stripePublishableKey set: $([ -n "$pk" ] && echo yes || echo no))"
          npm run build -- --base-href="/${{ github.event.repository.name }}/"
```

- [ ] **Step 4: Run it, verify it passes** — `npm test -- --include='**/stripe-payment.gateway.spec.ts'` → PASS.
  Add `@stripe/stripe-js` via `npm install @stripe/stripe-js` (pinned).
- [ ] **Step 5: Generalization-audit pass** — confirm `STRIPE_PUBLISHABLE_KEY` is documented in
  `docs/deploy/cd-pipeline.md`'s variables table (add a row). Record.
- [ ] **Step 6: Commit** — `git commit -m "U4-FE: Stripe gateway seam + publishable-key config + deploy injection (#50)"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 2 — `/booking/pay` page (mount → confirm → poll) + dialog/map wiring + confirmation guard

**Files:** Create `booking-pay.ts` (+ `.scss`) · Modify `booking-dialog.ts`, `venue-map.ts`,
`booking-confirmation.ts`, `app.routes.ts` · Test `booking-pay.spec.ts`, `booking-dialog.spec.ts`

The page renders one of: `mounting` → `ready` (PE mounted, "Pay" enabled) → on confirm:
`error`(retry, PE still mounted) **or** `processing`(polling) → `confirmed` **or** `awaiting`
(30s window elapsed). A cold load with no `lastAwaitingPayment` shows "start over".

- [ ] **Step 1: Write the failing tests** (representative — confirmed, decline, webhook-lag)

```ts
// booking-pay.spec.ts (essentials)
class FakeGateway extends StripePaymentGateway {
  confirmResult: { error?: string } = {};
  mounted = false;
  override async mountPaymentElement(host: HTMLElement, _cs: string) {
    this.mounted = true;
    host.appendChild(document.createElement('div')); // stand-in for the PE iframe
    return { confirm: async () => this.confirmResult };
  }
}

function setupPay(gateway: FakeGateway) {
  const bookings = { /* lastAwaitingPayment: signal(AWAITING).asReadonly(), getByCode: ... */ };
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: StripePaymentGateway, useValue: gateway },
      { provide: BookingService, useValue: bookings },
    ],
  });
  // ...create the component, return { fixture, httpMock }
}

it('stays processing until the backend reports CONFIRMED, then shows confirmed', async () => {
  vi.useFakeTimers();
  const gateway = new FakeGateway(); gateway.confirmResult = {}; // success
  const { fixture, httpMock } = setupPay(gateway);
  fixture.componentInstance.pay();              // user clicks Pay
  await fixture.whenStable();
  expect(fixture.componentInstance.state()).toBe('processing');

  // first poll → still AWAITING_PAYMENT
  httpMock.expectOne(/\/api\/bookings\/WXYZ345678$/).flush({ ...DETAIL, status: 'AWAITING_PAYMENT' });
  expect(fixture.componentInstance.state()).toBe('processing');

  vi.advanceTimersByTime(1500);                 // next poll → CONFIRMED
  httpMock.expectOne(/\/api\/bookings\/WXYZ345678$/).flush({ ...DETAIL, status: 'CONFIRMED' });
  expect(fixture.componentInstance.state()).toBe('confirmed');
  vi.useRealTimers();
});

it('declined card → retry state, no polling started', async () => {
  const gateway = new FakeGateway(); gateway.confirmResult = { error: 'Your card was declined.' };
  const { fixture, httpMock } = setupPay(gateway);
  fixture.componentInstance.pay();
  await fixture.whenStable();
  expect(fixture.componentInstance.state()).toBe('error');
  expect(fixture.componentInstance.errorMessage()).toContain('declined');
  httpMock.expectNone(/\/api\/bookings\//);     // never polled
});

it('webhook lag past the window → awaiting state, never confirmed', async () => {
  vi.useFakeTimers();
  const gateway = new FakeGateway(); gateway.confirmResult = {};
  const { fixture, httpMock } = setupPay(gateway);
  fixture.componentInstance.pay();
  await fixture.whenStable();
  for (let t = 0; t <= 30_000; t += 1500) {     // every poll returns AWAITING_PAYMENT
    httpMock.match(/\/api\/bookings\/WXYZ345678$/).forEach((r) =>
      r.flush({ ...DETAIL, status: 'AWAITING_PAYMENT' }));
    vi.advanceTimersByTime(1500);
  }
  expect(fixture.componentInstance.state()).toBe('awaiting');
  expect(fixture.componentInstance.state()).not.toBe('confirmed');
  vi.useRealTimers();
});
```

- [ ] **Step 2: Run it, verify it fails** — `npm test -- --include='**/booking-pay.spec.ts'` → FAIL (no component).

- [ ] **Step 3: Minimal implementation** (component sketch — real code in build)

```ts
// booking-pay.ts (core)
type PayState = 'mounting' | 'ready' | 'processing' | 'confirmed' | 'awaiting' | 'error' | 'missing';

@Component({
  selector: 'app-booking-pay',
  imports: [RouterLink],
  template: `/* @switch over state(): mounting spinner / PE host #peHost + Pay button /
    processing (role=status aria-live) / confirmed (link to /booking/{{code}}) /
    awaiting ("payment received — awaiting confirmation", show code + recheck link) /
    error (message role=alert + Pay retry, PE still mounted) / missing (start over) */`,
  styleUrl: './booking-pay.scss',
})
export class BookingPay {
  private readonly bookings = inject(BookingService);
  private readonly gateway = inject(StripePaymentGateway);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = viewChild<ElementRef<HTMLElement>>('peHost');

  protected readonly state = signal<PayState>('mounting');
  protected readonly errorMessage = signal<string | undefined>(undefined);
  private readonly awaiting = this.bookings.lastAwaitingPayment();
  protected readonly code = this.awaiting?.code ?? '';
  private checkout?: StripeCheckout;

  constructor() {
    if (!this.awaiting) { this.state.set('missing'); return; }
    afterNextRender(async () => {
      try {
        this.checkout = await this.gateway.mountPaymentElement(
          this.host()!.nativeElement, this.awaiting!.clientSecret);
        this.state.set('ready');
      } catch (e) { this.errorMessage.set(configError(e)); this.state.set('error'); }
    });
  }

  protected async pay(): Promise<void> {
    if (!this.checkout) return;
    this.errorMessage.set(undefined);
    const { error } = await this.checkout.confirm();
    if (error) { this.errorMessage.set(error); this.state.set('error'); return; } // invariant #8: NOT confirmed
    this.state.set('processing');
    this.startPolling();
  }

  private startPolling(): void {
    const deadline = POLL_WINDOW_MS; let elapsed = 0;
    timer(0, POLL_MS).pipe(
      switchMap(() => this.bookings.getByCode(this.code)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: (b) => {
        if (b.status === 'CONFIRMED') { this.state.set('confirmed'); /* complete */ }
        else if ((elapsed += POLL_MS) >= deadline) { this.state.set('awaiting'); /* complete */ }
      },
      // transient poll errors are ignored until the deadline → 'awaiting'
    });
  }
}
```

```ts
// booking-dialog.ts (onSubmit branch) — emit awaiting vs confirmed
const result = await firstValueFrom(this.bookings.createBooking({ ... }));
if (result.kind === 'awaiting') this.awaiting.emit(result.awaiting);
else this.booked.emit(result.confirmation);
```

```ts
// venue-map.ts — new handler
protected async onAwaiting(): Promise<void> {
  this.selectedSet.set(undefined);
  await this.router.navigate(['/booking/pay']);
}
```

```ts
// app.routes.ts — add BEFORE 'booking/:code'
{ path: 'booking/pay',
  loadComponent: () => import('./booking/booking-pay').then((m) => m.BookingPay),
  title: 'Complete payment — Riviera' },
```

```ts
// booking-confirmation.ts — guard: only render the confirmed card when status === 'CONFIRMED'
protected readonly confirmation = computed(() => {
  const c = this.bookings.lastConfirmation();
  return c?.status === 'CONFIRMED' ? c : undefined;
});
```

- [ ] **Step 4: Run it, verify it passes** — `npm test -- --include='**/booking-pay.spec.ts' --include='**/booking-dialog.spec.ts'` → PASS.
- [ ] **Step 5: Generalization-audit pass** — search every `booked.emit`/`onBooked` site for the
  202 branch; ensure the dialog's new `awaiting` output is wired in `venue-map.html` template too. Record.
- [ ] **Step 6: Commit** — `git commit -m "U4-FE: payment page mounts Payment Element, polls backend for CONFIRMED (#50)"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 3 — a11y/contrast specs + Playwright stripe-path e2e (Stripe mocked)

**Files:** Create `booking-pay.a11y.spec.ts`, `booking-pay.contrast.spec.ts` · Modify
`e2e/booking-flow.e2e.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// booking-pay.a11y.spec.ts — render each state, assert no critical/serious axe violations
it('processing state is accessible', async () => {
  const { fixture } = renderInState('processing');
  await expectNoAxeViolations(fixture.nativeElement);
});
// repeat: ready / confirmed / awaiting / error / missing
```

```ts
// e2e/booking-flow.e2e.ts — new scenario: stub the gateway + 202 + status polling
test('stripe-profile payment flow is accessible (Stripe mocked)', async ({ page }) => {
  await page.addInitScript(() => (window as any).__RIVIERA_FAKE_STRIPE__ = true); // gateway uses a fake when set
  await page.route('**/api/bookings', (r) => r.fulfill({ status: 202, json: AWAITING }));
  let polls = 0;
  await page.route(/\/api\/bookings\/WXYZ345678$/, (r) =>
    r.fulfill({ json: { ...DETAIL, status: polls++ < 1 ? 'AWAITING_PAYMENT' : 'CONFIRMED' } }));
  // drive map → dialog → submit → /booking/pay → Pay → processing → confirmed, axe at each step
});
```

> The app provides the **fake** gateway when `window.__RIVIERA_FAKE_STRIPE__` is set (a tiny
> conditional provider in `app.config.ts`, browser-only) so no real `js.stripe.com` call happens
> in CI. Document this seam in the component file.

- [ ] **Step 2: Run it, verify it fails** — `npm test -- --include='**/booking-pay.a11y.spec.ts'`
  + `npx playwright test` → FAIL.
- [ ] **Step 3: Minimal implementation** — render helpers + the `__RIVIERA_FAKE_STRIPE__` provider seam.
- [ ] **Step 4: Run it, verify it passes** — `npm test` (jsdom axe) + `npx playwright test` → PASS.
- [ ] **Step 5: Generalization-audit pass** — confirm the existing 201 e2e still passes alongside the
  new stripe-path one. Record.
- [ ] **Step 6: Commit** — `git commit -m "U4-FE: a11y specs + Stripe-path e2e for the payment page (#50)"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-06-29 | Phase 0 (createBooking return type changed to union) | callers of `createBooking` that consume the emitted value | `rg "createBooking\(" frontend/src` | `booking-dialog.ts` (only caller) | Updated the single caller to unwrap the union (confirmed → `booked`, awaiting → new `awaiting` output); `venue-map` routes the awaiting output to `/booking/pay`. No other callers. |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `npm test -- --include='**/booking.service.spec.ts' --include='**/booking-dialog.spec.ts'` → PASS. Commit `<sha>`.
- [ ] **AC-2:** `npm test -- --include='**/booking-pay.spec.ts'` (`stays processing until CONFIRMED`) → PASS. `<sha>`.
- [ ] **AC-3:** `npm test -- --include='**/booking-pay.spec.ts'` (`webhook-lag → awaiting`) → PASS. `<sha>`.
- [ ] **AC-4:** `npm test -- --include='**/booking-pay.spec.ts'` (`decline → retry, no poll`) → PASS. `<sha>`.
- [ ] **AC-5:** `npm test -- --include='**/booking.service.spec.ts'` (201 path) + `npx playwright test` (existing flow) → PASS. `<sha>`.
- [ ] **AC-6:** `stripe-payment.gateway.spec.ts` PASS + `grep -r "sk_" frontend/dist` → no match. `<sha>`.
- [ ] **AC-7:** `npm test` (jsdom axe specs) + `npx playwright test` (stripe path, mocked) → PASS. `<sha>`.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (N/A — frontend-only, no classpath change) (invariant #1).
- [ ] **Availability** section justified N/A — slice writes no availability row (invariant #2).
- [ ] Pool + cutoff rules: N/A — enforced server-side, unchanged (invariants #3, #4).
- [ ] **Modulith** section N/A — frontend-only, no backend Java (invariant #11).
- [ ] **Payment** section filled: confirmation is webhook-driven, observed via polling; the UI
  never confirms from the Stripe.js result; publishable key only, no secret (invariants #5, #8).
- [ ] Refund policy: N/A — no cancel/refund in this slice (invariant #10).
- [ ] Timezone: N/A — no new date arithmetic on the client (invariant #6).
- [ ] Booking codes: shown to the user, never logged; treated as bearer credential (invariant #7).
- [ ] Flyway: N/A — no schema change (invariant #12).
- [ ] **Frontend** standards met (signals, `@Service`/`inject()`, control flow, abstract-class DI
  token, `takeUntilDestroyed`); no `as any` on the contract; axe/WCAG-AA on all new states.
- [ ] Execution-status table at HEAD matches reality.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
