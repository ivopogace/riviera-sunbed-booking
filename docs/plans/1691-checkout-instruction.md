# Provider-neutral checkout instruction Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** a pending collection, the pay-on-accept read and the booking API all carry one closed
`CheckoutInstruction` (Embedded or Redirect) with an explicit kind, and the SPA's checkout seam
acts on either.

**Architecture:** `CheckoutInstruction` is a sealed `payment.vocabulary` type replacing
`PaymentOutcome.Pending`'s Stripe fields and `PaymentCredentials`. `payment.redirect_url` (V81)
persists the Redirect form so pay-on-accept can return either kind. The SPA's `CheckoutGateway`
dispatches on `kind`: Embedded to the `EmbeddedCheckoutGateway` token (Stripe.js), Redirect to
the existing `core/PageNavigation` seam.

**Source of intent:** #1691, ADR-0029 decision 11.

**Branch:** `claude/1691-checkout-instruction-094f0c`

## Acceptance criteria

- [ ] **AC-1:** Given the published `payment` surface, when its types are read, then none names a provider or carries `clientSecret`/`paymentIntentId`. *Seam:* `payment.api` + `payment.vocabulary` · *Pinned by:* `ProviderNeutralSurfacesTest.publishedSurfaceCarriesNoProviderShape`
- [ ] **AC-2:** Given a PaymentIntent is created, when Stripe's adapter initiates, then the outcome is `Pending` with an Embedded instruction of its client secret and id. *Seam:* `PaymentGateway` · *Pinned by:* `StripePaymentGatewayTest`
- [ ] **AC-3:** Given an open collection recorded with either kind, when the pay-on-accept read runs, then the same kind comes back; never both columns (`CHECK`). *Seam:* `Payments` · *Pinned by:* `JdbcPaymentsIT.aRedirectCollectionReadsBackAsARedirect`, `PaymentMigrationIT`
- [ ] **AC-4:** Given a `202` on instant booking, on stay creation, and a code-gated view awaiting payment, then the body's `payment.kind` names the instruction. *Seam:* routes · *Pinned by:* `CreateBookingStripeProfileIT`, `CreateStayCheckoutIT` (route-level), `RequestAcceptPayIT`, `CheckoutInstructionViewTest`
- [ ] **AC-5:** Given an Embedded instruction, when the guest pays, then Stripe checkout behaves as before. *Seam:* `BookingPay` + `EmbeddedCheckoutGateway` · *Pinned by:* existing `booking-pay.spec.ts`, mocked e2e
- [ ] **AC-6:** Given a Redirect instruction, when the guest continues, then the browser goes to its URL and nothing claims the payment happened. *Seam:* `CheckoutGateway` + `PageNavigation` · *Pinned by:* `checkout.gateway.spec.ts`, `booking-pay.spec.ts`, `request-to-book.e2e.ts` (redirect instruction)
- [ ] **AC-7:** Given any response other than those in AC-4, then no instruction appears. *Pinned by:* existing `BookingViewIT`, `RequestAcceptPayIT`, `RequestToBookFlowIT` (retargeted at the new field)

## Non-goals

- What a redirect provider's return URL shows (arrives with the Paysera/POK adapter).
- A real Redirect gateway: nothing wired returns one yet.
- Renaming `payment.payment_intent_id`/`client_secret` columns or `PaymentConfirmed`'s field: outside the AC's surface, and #102 is working beside them.

## Risks

- **R-1:** A `javascript:` or `http:` URL reaches `location.href` → `Redirect` refuses a non-https URL at construction, and the SPA's sink refuses it again.
- **R-2:** Guest returns with Back (bfcache) to a page frozen on "Processing…" → the redirect step reports `redirecting`, so the page clears its busy state before leaving and stays on the card step.
- **R-3:** The instruction leaks wider (#7) → it is built only where `clientSecret` was; AC-7's tests stay.
- **R-4:** Conflicts with #102 in `PaymentGateway`/`StripePaymentGateway`/`StubPaymentGateway` → the diff there is the two `initiate` lines and Javadoc; merge, never rebase.
- **R-5:** V81 number → claimed for this slice by the wave orchestrator; #102 takes V82.

## Open questions

None. `SPANS_VENUES` in the SPA's error mapping stays out: this slice does not touch `bookingErrorOf`, which the issue's comment makes the condition.

## Modulith

No new port conversation: `PaymentCredentialsLookup` is renamed `CheckoutInstructionLookup` (the same booking-view consumer). `CheckoutInstruction` joins `payment.vocabulary`; `booking` already holds `payment::api` + `payment::vocabulary`.

## Payment & payout

No money moves differently. Idempotency keys and the ledger are untouched; a booking is still confirmed only by the verified webhook (#8), whichever kind the browser was given.

## FE↔BE contract

`payment` on the `202` of `POST /api/bookings` and `POST /api/stays`, and on `GET /api/bookings/{code}`, replaces `clientSecret`/`paymentIntentId` and the old `payment` body:
`{ "kind": "EMBEDDED", "clientToken": "...", "url": null, "reference": "..." }` or
`{ "kind": "REDIRECT", "clientToken": null, "url": "https://...", "reference": "..." }`.

## Phases

- **Phase 1 — Backend instruction:** vocabulary, gateway, persistence (V81), booking outcomes, wire views · red `JdbcPaymentsIT.aRedirectCollectionReadsBackAsARedirect`, `CheckoutInstructionViewTest`
- **Phase 2 — SPA seam:** `CheckoutGateway`, `EmbeddedCheckoutGateway`, the page's Redirect path · red `checkout.gateway.spec.ts`, `booking-pay.spec.ts`
- **Phase 3 — e2e and docs:** the redirect e2e, fixtures, `RESPONSIBILITIES.md`, skills, runbook · red the e2e

## Execution status

**Stage pointer:** implement (phases 1-3 built)

**Next action:** mocked e2e, then open the PR

| Phase | Status | Commits |
|-------|--------|---------|
| 1 — Backend instruction | ✅ | (first commit) |
| 2 — SPA seam | ✅ | (first commit) |
| 3 — e2e and docs | ⏳ | (first commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
