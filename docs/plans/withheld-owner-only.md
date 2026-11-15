# Withheld-mail notice for the verified owner only (G-3) Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** a code-gated booking read tells a reader whether the confirmation mail was withheld only
when the reader is the signed-in owner of the booking and the booking's contact address is that
account's verified email; every other reader gets one neutral answer and the suppression list is
never consulted for them.

**Architecture:** one disclosure rule in `booking.application` (`ConfirmationMailDisclosure`) used by
the view and both create services, returning a three-state `MailDisclosure` (`UNDISCLOSED`, `EMAILED`,
`WITHHELD`) that replaces the `emailWithheld` boolean on the wire. The address comparison stays in
`customer` (`CustomerAccountDirectory#holdsVerifiedAddress`, canonical via `Emails.normalize`), so
`booking` still never sees an address. The reader is the session principal, resolved in the controller.

**Source of intent:** #1748 (Decision + ACs binding, owner decided 2026-11-14). Basis: OWASP WSTG-IDNT-04.

**Branch:** `bugfix/1748-withheld-owner-only`

## Acceptance criteria

- [ ] **AC-1:** Given a guest (no session) reading a `CONFIRMED` booking under a collecting gateway,
  when the contact address is suppressed and when it is not, then both bodies carry
  `confirmationMail: "UNDISCLOSED"` (identical mail field, same keys, same status) and
  `ConfirmationMailDelivery` is never asked. *Seam:* `GET /api/bookings/{code}` · *Pinned by:*
  `BookingViewSuppressionIT.aGuestReadsTheSameMailFieldForASuppressedAndADeliverableAddress`,
  `ConfirmationMailDisclosureTest.aReaderWithoutASessionIsNeverAnswered`
- [ ] **AC-2:** Given a signed-in customer reading their own booking whose contact address is their
  verified address, when it is suppressed then `WITHHELD`, when not then `EMAILED`. *Seam:* same
  route with a customer principal · *Pinned by:* `BookingViewSuppressionIT.theVerifiedOwnerIsToldTheMailWasWithheld`,
  `…theVerifiedOwnerOfADeliverableAddressIsToldItWasEmailed`
- [ ] **AC-3:** Given a signed-in customer reading their own booking whose contact address is not their
  verified address (the attacker case), or an unverified account, or someone else's booking, then
  `UNDISCLOSED` and the suppression port is never called. *Seam:* `ConfirmationMailDisclosure` ·
  *Pinned by:* `ConfirmationMailDisclosureTest` (never-called assertions), `BookingViewSuppressionIT.anAttackerBookingAVictimsAddressUnderTheirOwnAccountLearnsNothing`
- [ ] **AC-4:** The same rule on the stay view and the `201 CONFIRMED` create bodies
  (`BookingConfirmationView`, `StayView`). *Pinned by:* `ViewBookingServiceTest`,
  `CreateBookingServiceTest`, `CreateStayServiceTest`, `BookingCreationViewsContractTest`
- [ ] **AC-5:** A contact address differing from the verified address only by case or padding counts as
  equal. *Seam:* `CustomerAccountDirectory#holdsVerifiedAddress` · *Pinned by:*
  `CustomerAccountServiceTest.aContactDifferingOnlyByCaseOrPaddingIsTheVerifiedAddress`
- [ ] **AC-6:** The SPA shows "We've also emailed it to you." for `EMAILED`, the withheld notice for
  `WITHHELD`, and the neutral "We're emailing it to you. Keep this code in case it doesn't arrive."
  for `UNDISCLOSED`, on both the confirmation screen and the pay page's done panel; one component
  owns the three copies. *Pinned by:* `confirmation-mail-note.spec.ts`, `booking-confirmation.spec.ts`,
  `booking-pay.spec.ts`, mocked e2e `suppressed-confirmation.e2e.ts` (guest neutral copy).
- [ ] **AC-7:** RESPONSIBILITIES.md §booking / §notification *withheld-flag probe* rewritten to the
  closed state; the runbook precondition ticked off; the `EmailSuppressions#suppress` warning updated.

## Non-goals

- Linking a guest row to an account (D-6 stands: the check compares, it never links).
- The verification-resend's own `emailWithheld` (`/api/auth/me` surface) — the caller owns that address already.

## Risks

- **R-1:** a timing difference between suppressed and unsuppressed for a non-owner → the rule returns
  before any read for every non-owner path; the suppression port is only reached after the owner check.
- **R-2:** an attacker registers an account under the victim's address → that account is unverified,
  so `holdsVerifiedAddress` is false.
- **R-3:** wire rename breaks a client → the SPA and every mocked fixture move in the same PR; the
  pre-payment `202` bodies carry `UNDISCLOSED` as they carried `false`.
- **R-4:** an operator session named like a customer → `CustomerPrincipal.isCustomer` gate, as on create.

## Open questions

### Resolved

- Keep the `CONFIRMED` + `CollectionGuarantee` gate? — Yes: the issue says ownership "joins" it, and it
  keeps the create branch unreachable-but-correct.
- Wire shape — a three-state enum, since the SPA must tell owner-unsuppressed from non-owner while a
  non-owner's two cases stay identical.

## Modulith

- `customer::api` `CustomerAccountDirectory#holdsVerifiedAddress(CustomerAccountId, CustomerId)`: owner
  `customer` (both identities and the canonical form are its job); consumer `booking`. No new grant
  (`customer::api` already allowed). Pinned by `CustomerAccountServiceTest`, `ModularityTests`.
- `booking.application.Bookings#accountOf(long bookingId)`: in-module read of `booking.account_id`.

## FE↔BE contract

- `GET /api/bookings/{code}` (`BookingDetailView`), `POST /api/bookings` `201` (`BookingConfirmationView`),
  `POST /api/stays` bodies (`StayView`): `emailWithheld: boolean` → `confirmationMail: "UNDISCLOSED" | "EMAILED" | "WITHHELD"`.

## Phases

- **Phase 0 — customer owner check:** `holdsVerifiedAddress` · red `CustomerAccountServiceTest`
- **Phase 1 — disclosure rule + wire:** `ConfirmationMailDisclosure`, view/create wiring, reader from
  the session · red `ConfirmationMailDisclosureTest`, `BookingViewSuppressionIT`
- **Phase 2 — SPA:** one `ConfirmationMailNote` component, both surfaces, translations, e2e · red specs
- **Phase 3 — docs:** RESPONSIBILITIES, runbook, Javadoc

## Execution status

**Stage pointer:** implement (phase 2)

**Next action:** SPA: one `ConfirmationMailNote` component on both surfaces

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — customer owner check | ✅ | phase-0+1 commit |
| 1 — disclosure rule + wire | ✅ | phase-0+1 commit |
| 2 — SPA | ⏳ | |
| 3 — docs | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
