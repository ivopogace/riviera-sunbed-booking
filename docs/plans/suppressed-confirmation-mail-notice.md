# Suppressed-Confirmation-Mail Notice Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** When a booking is CONFIRMED and its guest address is on the do-not-mail list, the
post-payment confirmation surfaces tell the tourist that no confirmation email is coming and
that the booking code on screen is their only record — while no endpoint reveals suppression
before payment.

**Architecture:** The single significant decision is **how "the mail was withheld" reaches the
confirmation response**. `notification` already depends on `booking` (its `BookingConfirmed`
listener), so `booking` must not depend back — the flag arrives through a **new `booking.spi`
named interface, `ConfirmationMailDelivery#isWithheld(CustomerId)`, implemented by
`notification`** (the acyclic inversion, the same shape as `customer.spi.GuestBookingHistory`
implemented by `booking`). The value is computed **live at read time**, not recorded from the
send attempt, because the `201` instant-confirm response body is built *before* the after-commit
async mail listener has run — a recorded outcome could never populate it, and would race the
stripe poll. It is computed **only for `CONFIRMED` bookings**, which is what keeps the
pre-payment oracle closed.

**Persistence:** JDBC only (invariant #1). **No Flyway migration** — the read reuses the existing
`email_suppression` table through `notification`'s `JdbcEmailSuppressions` adapter (whose
adapter-scoped `queryTimeout` from #386 bounds it). `booking.customer_id` (NOT NULL since V5) is
added to two existing `SELECT` lists in `JdbcBookings`; no DDL.

**Source of intent:** GitHub issue **#390** (context: #382/#385 suppression list, ADR-0012
posture, ADR-0006 booking-code URL as the durable record).

**Skills consulted:**
- `riviera-sdlc` — ran the issue-intake grill gate + the Skill-routing gate; supplied the
  cloud-session branch substitution.
- `riviera-modulith` — decided `spi/` over `api/` (an "implement-me" interface in `api/` is the
  RV-BE-3b smell); fixed the grant direction (`booking::spi` granted to `notification` only) and
  confirmed `booking` gains no new dependency, so no cycle.
- `riviera-plan-doc` — this document's structure and the AC-at-the-inner-hexagon rule.
- `riviera-java-conventions` — *(phase 0/1)* records for the DTOs, package-private adapter,
  no Lombok, typed outcome over exception.
- `riviera-frontend` + `angular-developer` + angular-cli MCP — *(phase 2)* component placement
  and v22 signal APIs.
- `riviera-tailwind` — *(phase 2)* styling call for the new notice element on two SCSS components.
- `playwright-cli` — *(phase 3)* e2e spec authored to best practice, in the CI-safe mocked suite.
- `riviera-local-debug` — scoped test recipes for this cloud session.

**Branch:** cloud session — the designated remote branch **`claude/sdlc-390-review-gate-1xccd5`**
stands in for `feature/suppressed-confirmation-mail-notice` (`riviera-sdlc` remote addendum). The
literal `feature/*` branch is deliberately not created.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a `CONFIRMED` booking whose guest contact is on the suppression list, when the
      view-a-booking use case loads it by code, then the returned `BookingDetail` reports
      `emailWithheld = true`. *Pinned by:* `ViewBookingServiceTest.flagsWithheldConfirmationMailForSuppressedGuest`
- [ ] **AC-2:** Given a `CONFIRMED` booking whose guest contact is not suppressed, when it is loaded
      by code, then `emailWithheld = false`. *Pinned by:* `ViewBookingServiceTest.doesNotFlagWithheldMailForDeliverableGuest`
- [ ] **AC-3:** Given a booking that is **not** `CONFIRMED` (`AWAITING_PAYMENT` or `PENDING_REQUEST`),
      when it is loaded by code, then `ConfirmationMailDelivery` is **never consulted** and
      `emailWithheld = false` — the pre-payment oracle stays closed.
      *Pinned by:* `ViewBookingServiceTest.neverConsultsMailDeliveryBeforeConfirmation`
- [ ] **AC-4:** Given an instant-confirm create (the `201 CONFIRMED` path) for a suppressed guest,
      when the booking is created, then the returned `BookingConfirmation` reports
      `emailWithheld = true`. *Pinned by:* `CreateBookingServiceTest.flagsWithheldConfirmationMailOnInstantConfirm`
- [ ] **AC-5:** Given a `CustomerId` whose contact address is on the suppression list, when
      `notification`'s `ConfirmationMailDelivery` implementation is asked, then it reports withheld;
      given an unknown `CustomerId`, it reports **not** withheld (nothing to withhold).
      *Pinned by:* `SuppressedConfirmationMailDeliveryTest.reportsWithheldForSuppressedContact`,
      `…​.reportsDeliverableForUnknownCustomer`
- [ ] **AC-6:** Given the suppression lookup throws, when a confirmed booking is loaded, then the read
      still succeeds with `emailWithheld = false` (the notice degrades; the booking view never 500s).
      *Pinned by:* `SuppressedConfirmationMailDeliveryTest.reportsDeliverableWhenTheLookupFails`
- [ ] **AC-7:** Given a confirmation hand-off with `emailWithheld = true`, when the confirmation screen
      renders, then it shows the "we couldn't email you — save your code" notice and **drops** the
      "We've also emailed it to you." claim; with `false`, the screen is byte-for-byte as today.
      *Pinned by:* `booking-confirmation.spec.ts` ("shows the withheld-email notice…", "keeps the emailed-it copy…")
- [ ] **AC-8:** Given the payment page reaches `confirmed` and the polled detail carries
      `emailWithheld = true`, when the done panel renders, then it shows the same notice.
      *Pinned by:* `booking-pay.spec.ts` ("shows the withheld-email notice once confirmed")
- [ ] **AC-9:** Given a mocked backend returning a suppressed confirmed booking, when a guest completes
      the booking flow, then the notice is visible on the post-payment surface; with a deliverable
      address it is absent. *Pinned by:* `frontend/e2e/suppressed-confirmation.e2e.ts`
- [ ] **AC-10:** Given the new `booking.spi` surface and `notification`'s grant, when the structural
      net runs, then the module structure verifies. *Pinned by:* `ModularityTests.verifiesModularStructure`,
      `PublishedSurfacePlacementArchitectureTests`, `PackageShapeArchitectureTests`

## Non-goals

- **Any pre-payment surface.** The `202 AWAITING_PAYMENT` and `202 PENDING_REQUEST` bodies are
  untouched; nothing before confirmation reveals suppression status (issue #390 constraint 1, D-8).
- **The durable `/booking/:code` page and `/me/bookings`.** The flag rides
  `GET /api/bookings/{code}`, so `BookingView` receives it, but it is deliberately **not rendered**
  there — the maintainer scoped this to the two post-payment surfaces.
- **A resend-the-mail affordance** (that is #380's admin resend) and **the bounce/complaint feed**
  that will actually populate the list in prod (#370 / epic #367 story 10).
- **Changing suppression semantics** — no new suppression reason, no write path, no change to
  never-deleted (ADR-0012 as amended by #391).
- **Back-linking guest bookings or any account behavior** (D-6 permanent non-goal).
- **Making the mail actually send** to a suppressed address. The invariant stands; this slice only
  makes its consequence visible.

## Behavior-parity ledger

> No surface is retired or replaced by this slice, but one existing **claim** is, so it gets a row.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `booking-confirmation`: unconditional "Show this code to staff when you arrive. We've also emailed it to you." | **changed** | The sentence splits: the "show this code" half is unconditional; the "we've also emailed it" half renders only when `emailWithheld === false`. When withheld, the notice replaces it. A deliverable booking renders exactly today's string. |
| `booking-pay` confirmed panel: "Your payment is complete. Show this code to staff when you arrive." (never claimed an email) | **preserved** | Unchanged; the notice is *added* below the code, not substituted. |
| `booking-view` (`/booking/:code`): makes no email claim | **preserved** | Receives the new field in its payload and ignores it (non-goal above). |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | **Pre-payment suppression oracle** — an attacker creates a booking for an arbitrary address, gets the code in the `202` body before paying, and reads suppression from `GET /api/bookings/{code}` (breaks D-8 non-enumeration) | med | high | The flag is computed **only** when `status == CONFIRMED`; the port is not called otherwise, and `AwaitingPaymentView`/`RequestedView` gain no field. Pinned by **AC-3** | agent | open |
| R-2 | A suppression-lookup failure turns the confirmation read into a `500`, breaking the page that carries the booking code | low | high | `notification`'s implementation catches and reports "not withheld"; the notice degrades, the code always renders. Pinned by **AC-6** | agent | open |
| R-3 | **Module cycle** `booking ↔ notification` | low | high | The port lives in `booking.spi` and is *implemented* by `notification`; `booking`'s `allowedDependencies` are unchanged. Pinned by **AC-10** | agent | open |
| R-4 | Extra DB round-trip on every confirmed booking read — `booking-pay` polls `GET /api/bookings/{code}` every 1.5 s | med | low | Polling stops the moment it sees `CONFIRMED`, so at most one or two lookups per booking; the read is a PK-shaped hit on `email_suppression` bounded by the adapter's own `queryTimeout` (#386) — never the global property, which would also bound `availability`'s `SELECT … FOR UPDATE` (invariant #2) | agent | open |
| R-5 | Guest **PII leaking** into the booking module or the response | low | med | The port speaks `CustomerId` and returns a `boolean`; `booking` never handles an address, the wire carries no address, and no log line names one (the module's existing PII posture) | agent | open |
| R-6 | Adding a required field to the FE `BookingDetail` type breaks existing spec fixtures | high | low | Mechanical: update fixtures in the same phase; `npm test` is the gate. A required boolean is the project convention (cf. `requestExpiresAt`, #98) — no optional-field weakening of the contract | agent | open |
| R-7 | The error contract of the touched endpoints drifts to a per-controller body | low | med | No new error path is added; `BookingController` keeps its centralized `ApiProblem`/`ProblemDetail` mapping (`riviera-java-conventions` §6b) | agent | open |

## Open questions / Assumptions

*(none open — both intake questions were answered by the maintainer before phase 0)*

### Resolved

- **Open question:** How does "the mail was withheld" reach the confirmation response — the slice's
  main seam question (issue #390 constraint 2)? → **Resolved** at intake: a **live suppression query**
  through a new `booking.spi` port implemented by `notification`, not a recorded send outcome. The
  deciding fact: the `201` instant-confirm body is built before the after-commit async mail listener
  runs, so a recorded outcome could never populate that surface, and it races the stripe poll.
- **Open question:** Which surfaces render the notice? → **Resolved** at intake: **both post-payment
  surfaces only** — `/booking/confirmation` (instant/`201` profile, where the "we've also emailed it
  to you" claim lives today) and the confirmed panel of `/booking/pay` (the stripe profile — the one
  reached in production). Not `/booking/:code`, not `/me/bookings`.
- **Assumption:** the notice is shown to signed-in customers as well as guests — a signed-in customer
  with a suppressed address gets no email either, and branching the copy on principal type would add
  a branch for no benefit. → Accepted with the surface decision above.

## Availability & concurrency (invariant #2)

**N/A — does not affect availability.** The slice is **read-side only**: it adds one derived boolean
to two existing read models and one new *query* port. It opens no transaction, writes no row, and
touches no `availability(set_id, booking_date)` write path — the claim/release choreography
(`AvailabilityClaim` at claim time, release on cancel/decline/expiry) is byte-for-byte unchanged, as
is the reserve→pay→confirm orchestration. No booking lifecycle transition is added or altered; the
`CONFIRMED` gate on the new flag is a read-time branch, not a state change.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `booking` | existing | `Booking` | Owns the booking read models the confirmation surfaces render; the flag is a field of the booking view. It declares the `spi` port because it is the module that *needs* the answer and must not depend on `notification`. |
| M-2 | `notification` | existing | *(none — owns `email_suppression` state, no aggregate)* | Owns the suppression list and the *no send to a suppressed address* invariant, so it is the only module that can answer "will this confirmation mail be withheld". |
| M-3 | `customer` | existing (unchanged) | `Customer` | Already resolves `CustomerId → GuestContact` via `customer.api.CustomerLookup`; `notification` already holds that grant. No change. |

**Cross-module named interfaces (`spi/` ports)**

| # | Module.spi | Port | Public types | Implementor |
|---|---|---|---|---|
| SPI-1 | `booking.spi` (**new** named interface) | `ConfirmationMailDelivery#isWithheld(CustomerId)` | `customer.vocabulary.CustomerId` (already granted to `booking`), `boolean` | `notification` — granted `booking::spi` |

> `booking` publishes `api/` + `events/` + `vocabulary/` today and **no `spi/`**; this slice adds its
> first. Direction check (`riviera-modulith`, api-vs-spi rule): another module *implements* it →
> `spi/`, never `api/`. `booking`'s own `allowedDependencies` are **unchanged** — it references only
> its own package — so the one new graph edge is `notification → booking::spi`, and the graph stays
> acyclic.

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| — | *none added* | — | — | — | — | — |

> Deliberately **no** event: an event from `notification` back to `booking` would make `booking`
> depend on `notification::events` and close the very cycle the `spi` inversion exists to avoid.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Decide whether a confirmation mail to a given customer will be withheld | `notification` | `notification` **Job**: owns the email-suppression list and the defining invariant *no send to a suppressed address*. Not `booking` — mail delivery is nowhere on its Job line, and `booking`'s **Not My Job** already sends contact storage to `customer`. |
| Resolve `CustomerId` → contact address for that decision | `customer` (via `customer.api.CustomerLookup`) | `customer` **Job**: tourist identity + guest-checkout contact. `booking`'s **Not My Job**: "Storing guest contact details → `customer`" — so `booking` never sees the address; `notification` already holds this grant for the confirmation-mail listener. |
| Expose the withheld fact on the booking read models (`BookingDetail`, `BookingConfirmation`) and their HTTP views | `booking` | `booking` **Job**: owns bookings, their lifecycle and the view-a-booking use case (U6). The flag is a field of *its* read model; it obtains the answer through its own `spi` port rather than depending on `notification` (invariant #11, acyclic). |
| Gate the fact on `status == CONFIRMED` (the non-enumeration boundary) | `booking` | The gate is a property of the **booking lifecycle**, which `booking` owns; putting it in `notification` would make the mail module reason about booking status it does not own. |

## Payment & payout (invariants #5, #8, #9, #10)

**N/A — no payment in scope.** No money moves, no charge/refund is created, no ledger entry is
written or reversed, and no Stripe call is added. The slice only *reads* bookings that are already
`CONFIRMED` — and confirmation still arrives solely from the signature-verified webhook (invariant
#8); nothing here confirms a booking or lets the client influence payment state.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `booking/booking.model.ts` | modified | typed contract | — | — |
| FE-2 | `booking/booking-confirmation.ts` | modified | standalone component | existing `computed()` over `BookingService.lastConfirmation()` | none |
| FE-3 | `booking/booking-pay.ts` | modified | standalone component | new `signal` set from the poll's `BookingDetail` | none |
| FE-4 | `booking/booking-confirmation.scss`, `booking-pay.scss` | modified | component styles | — | — |

**Standards:** standalone components, `inject()`, `@if`, signal APIs, no `changeDetection`/`standalone`
declarations (v22 defaults). The notice is a `role="status"` region so a screen reader hears it, with
AA contrast pinned by the existing `*.contrast.spec.ts` siblings. Styling follows the component's
existing SCSS (both files are SCSS-styled today); `riviera-tailwind` is consulted at phase 2 to
confirm that extending the existing SCSS — rather than introducing a lone Tailwind island — is the
right call on these two components.

## FE↔BE contract

- **Changed responses:**
  - `GET /api/bookings/{code}` → `BookingDetailView` gains **`emailWithheld: boolean`**, `true` only
    when `status == "CONFIRMED"` and the guest address is suppressed; `false` in every other case.
  - `POST /api/bookings` **`201`** → `BookingConfirmationView` gains **`emailWithheld: boolean`**.
  - `POST /api/bookings` **`202`** (`AwaitingPaymentView`, `RequestedView`) — **unchanged**, deliberately
    (R-1).
- **Client typing:** hand-written typed interfaces in `booking.model.ts` (`BookingConfirmation`,
  `BookingDetail`) gain a required `readonly emailWithheld: boolean`. No `as any`; fixtures updated.
- **Money/date on the wire:** unchanged — amounts stay integer minor units + currency, dates ISO
  `LocalDate`.

## Execution status

**Stage pointer:** `plan — committing the plan doc`

**Next action:** Start phase 0 — write `SuppressedConfirmationMailDeliveryTest` red, then add
`booking.spi.ConfirmationMailDelivery` + `notification`'s implementation.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `booking.spi` port + `notification` implementation | | |
| 1 — carry `emailWithheld` on the booking read + create paths | | |
| 2 — Angular notice on both post-payment surfaces | | |
| 3 — Playwright e2e (mocked suite) | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | *(none yet)* | — |

---

## File structure

**Backend — `platform/src/main/java/ai/riviera/platform/`**

- `booking/spi/ConfirmationMailDelivery.java` — **new.** The driven port: will the confirmation mail
  be withheld from this customer?
- `booking/spi/package-info.java` — **new.** `@NamedInterface("spi")`.
- `notification/adapter/out/SuppressedConfirmationMailDelivery.java` — **new.** Package-private
  implementation: `CustomerLookup` → address → `EmailSuppressions.isSuppressed`, degrading to
  "not withheld" on failure.
- `notification/package-info.java` — grant `booking::spi`.
- `booking/application/view/BookingRecord.java` — carry `customerId`.
- `booking/application/view/BookingDetail.java` — carry `emailWithheld`.
- `booking/application/view/ViewBookingService.java` — compute the flag, `CONFIRMED` only.
- `booking/application/reserve/BookingConfirmation.java` — carry `emailWithheld`.
- `booking/application/reserve/ReserveOutcome.java` — `Reserved` carries `CustomerId`.
- `booking/application/reserve/CreateBookingService.java` — compute the flag on the `201` path only.
- `booking/adapter/out/JdbcBookings.java` — select `customer_id` in the two `BookingRecord` reads.
- `booking/adapter/in/BookingDetailView.java`, `BookingConfirmationView.java` — expose the field.
- `booking/application/view/MyBookingsService.java` — *(check only)* unchanged; the list view has no
  such field.

**Backend tests — `platform/src/test/java/ai/riviera/platform/`**

- `notification/SuppressedConfirmationMailDeliveryTest.java` — **new** (AC-5, AC-6).
- `booking/ViewBookingServiceTest.java` — extend (AC-1, AC-2, AC-3).
- `booking/CreateBookingServiceTest.java` — extend (AC-4).

**Frontend — `frontend/src/app/booking/`**

- `booking.model.ts`, `booking-confirmation.ts`, `booking-confirmation.scss`,
  `booking-pay.ts`, `booking-pay.scss` — the notice (AC-7, AC-8).
- `booking-confirmation.spec.ts`, `booking-pay.spec.ts`, plus the `*.a11y.spec.ts` /
  `*.contrast.spec.ts` siblings.

**Frontend e2e — `frontend/e2e/`**

- `suppressed-confirmation.e2e.ts` — **new**, the CI-safe mocked suite (AC-9).

---

## Phase 0 — `booking.spi` port + `notification` implementation

**Files:** Create `booking/spi/ConfirmationMailDelivery.java`, `booking/spi/package-info.java`,
`notification/adapter/out/SuppressedConfirmationMailDelivery.java`,
`platform/src/test/java/ai/riviera/platform/notification/SuppressedConfirmationMailDeliveryTest.java` ·
Modify `notification/package-info.java`

- [ ] **Step 1: Write the failing test**

```java
package ai.riviera.platform.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.dao.QueryTimeoutException;

import ai.riviera.platform.booking.spi.ConfirmationMailDelivery;
import ai.riviera.platform.customer.api.CustomerLookup;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.customer.vocabulary.GuestContact;
import ai.riviera.platform.notification.adapter.out.NotificationAdapters;
import ai.riviera.platform.notification.application.EmailSuppressions;

class SuppressedConfirmationMailDeliveryTest {

	private static final CustomerId GUEST = new CustomerId(7L);
	private static final GuestContact CONTACT = new GuestContact("guest@example.com", "Ada Guest", "+355 6 000");

	private final CustomerLookup customers = mock(CustomerLookup.class);
	private final EmailSuppressions suppressions = mock(EmailSuppressions.class);
	private final ConfirmationMailDelivery delivery =
			NotificationAdapters.confirmationMailDelivery(customers, suppressions);

	@Test
	void reportsWithheldForSuppressedContact() {
		when(customers.findById(GUEST)).thenReturn(Optional.of(CONTACT));
		when(suppressions.isSuppressed(CONTACT.email())).thenReturn(true);

		assertThat(delivery.isWithheld(GUEST)).isTrue();
	}

	@Test
	void reportsDeliverableForUnsuppressedContact() {
		when(customers.findById(GUEST)).thenReturn(Optional.of(CONTACT));
		when(suppressions.isSuppressed(CONTACT.email())).thenReturn(false);

		assertThat(delivery.isWithheld(GUEST)).isFalse();
	}

	@Test
	void reportsDeliverableForUnknownCustomer() {
		when(customers.findById(GUEST)).thenReturn(Optional.empty());

		assertThat(delivery.isWithheld(GUEST)).isFalse();
	}

	@Test
	void reportsDeliverableWhenTheLookupFails() {
		when(customers.findById(GUEST)).thenReturn(Optional.of(CONTACT));
		when(suppressions.isSuppressed(any())).thenThrow(new QueryTimeoutException("wedged"));

		assertThat(delivery.isWithheld(GUEST)).isFalse();
	}
}
```

> The package-private adapter is reached through a tiny package-private test factory
> (`NotificationAdapters`) rather than by widening the class to `public` — the project's
> package-private-adapter convention (`riviera-java-conventions`). If an equivalent seam already
> exists in the module's tests, reuse it instead of adding one.

- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*SuppressedConfirmationMailDeliveryTest*"`
      → FAIL: `package ai.riviera.platform.booking.spi does not exist`

- [ ] **Step 3: Minimal implementation**

```java
// booking/spi/ConfirmationMailDelivery.java
package ai.riviera.platform.booking.spi;

import ai.riviera.platform.customer.vocabulary.CustomerId;

/**
 * Whether the booking-confirmation mail will be <em>withheld</em> from a customer (#390) — the
 * cross-module driven port {@code booking} declares and {@code notification} implements.
 *
 * <p>The inversion is load-bearing: {@code notification} already depends on {@code booking} (its
 * {@code BookingConfirmed} listener), so a {@code booking → notification} edge would close a cycle.
 * Declaring the port here and granting {@code booking::spi} to the implementor keeps the graph
 * acyclic — the same shape as {@code customer.spi.GuestBookingHistory}, implemented by
 * {@code booking}.
 *
 * <p>Answered <strong>live</strong>, not recorded from a send attempt: the {@code 201}
 * instant-confirm response is built before the after-commit mail listener has run, so a recorded
 * outcome could never populate it. The question is therefore "will this mail be withheld", which is
 * stable and race-free.
 *
 * <p>Never throws for an operational failure — an unanswerable lookup reports {@code false}, so a
 * confirmation view degrades to "no notice" instead of failing (the booking code on that page is the
 * guest's only record).
 */
public interface ConfirmationMailDelivery {

	/** Whether a confirmation mail to this customer's address would be withheld as suppressed. */
	boolean isWithheld(CustomerId customerId);
}
```

```java
// booking/spi/package-info.java
@org.springframework.modulith.NamedInterface("spi")
package ai.riviera.platform.booking.spi;
```

```java
// notification/adapter/out/SuppressedConfirmationMailDelivery.java
package ai.riviera.platform.notification.adapter.out;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.spi.ConfirmationMailDelivery;
import ai.riviera.platform.customer.api.CustomerLookup;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.notification.application.EmailSuppressions;

/**
 * Answers {@code booking}'s {@link ConfirmationMailDelivery} port from this module's own state
 * (#390): resolve the customer's address via {@code customer}'s published lookup, then consult the
 * do-not-mail list — the exact pair the {@code BookingConfirmed} listener consults before sending,
 * so the surface's answer and the send decision cannot diverge.
 *
 * <p><strong>Degrades rather than fails.</strong> Unlike the send path, nothing here is retried: the
 * caller is rendering a confirmation page whose booking code is the guest's only record, so an
 * unanswerable lookup reports "not withheld" and the page simply omits the notice. Bounded by the
 * suppression adapter's own {@code queryTimeout} (#386), so a wedged read aborts instead of hanging
 * the response.
 */
@Component
class SuppressedConfirmationMailDelivery implements ConfirmationMailDelivery {

	private static final Logger log = LoggerFactory.getLogger(SuppressedConfirmationMailDelivery.class);

	private final CustomerLookup customers;
	private final EmailSuppressions suppressions;

	SuppressedConfirmationMailDelivery(CustomerLookup customers, EmailSuppressions suppressions) {
		this.customers = customers;
		this.suppressions = suppressions;
	}

	@Override
	public boolean isWithheld(CustomerId customerId) {
		try {
			return customers.findById(customerId)
					.map(contact -> suppressions.isSuppressed(contact.email()))
					.orElse(false);
		}
		catch (DataAccessException e) {
			// No address in the line (the module's PII posture); the correlation id rides the MDC.
			log.warn("Suppression lookup failed for a confirmation view ({}); omitting the notice",
					e.getClass().getSimpleName());
			return false;
		}
	}
}
```

```java
// notification/package-info.java — grant only the new surface
allowedDependencies = { "booking::api", "booking::events", "booking::spi", "booking::vocabulary",
        "customer::api", "customer::vocabulary", "venue::api", "venue::vocabulary", "shared" }
```

- [ ] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*SuppressedConfirmationMailDeliveryTest*"` → PASS

- [ ] **Step 5: Run the structural net** —
      `./gradlew test --tests "*ModularityTests*" --tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*"` → PASS (AC-10)

- [ ] **Step 6: Generalization-audit pass** — search for other read surfaces that claim an email was
      sent (`grep -rn "emailed" frontend/src platform/src`), record the candidates and the decision.

- [ ] **Step 7: Commit** — `git commit -m "feat(#390): booking.spi port for confirmation-mail suppression, implemented by notification"`

- [ ] **Step 8: Update the plan-doc execution status** in the same commit window.

---

## Phase 1 — carry `emailWithheld` on the booking read + create paths

**Files:** Modify `booking/application/view/{BookingRecord,BookingDetail,ViewBookingService}.java`,
`booking/application/reserve/{BookingConfirmation,ReserveOutcome,CreateBookingService,ReserveSetService}.java`,
`booking/adapter/out/JdbcBookings.java`, `booking/adapter/in/{BookingDetailView,BookingConfirmationView}.java` ·
Test `booking/ViewBookingServiceTest.java`, `booking/CreateBookingServiceTest.java`

- [ ] **Step 1: Write the failing tests** — the three `ViewBookingServiceTest` cases (AC-1/2/3) and the
      `CreateBookingServiceTest` case (AC-4). The AC-3 case is the important one and asserts a
      *negative interaction*:

```java
@Test
void neverConsultsMailDeliveryBeforeConfirmation() {
    bookings.save(awaitingPaymentBookingWithCode("ABCD2345"));

    BookingDetail detail = service.byCode("ABCD2345").orElseThrow();

    assertThat(detail.emailWithheld()).isFalse();
    verifyNoInteractions(mailDelivery);   // no pre-payment oracle (R-1)
}
```

- [ ] **Step 2: Run them, verify they fail** —
      `./gradlew test --tests "*ViewBookingServiceTest*" --tests "*CreateBookingServiceTest*"`
      → FAIL: `cannot find symbol: method emailWithheld()`

- [ ] **Step 3: Minimal implementation** — thread the flag through:
  - `BookingRecord` gains `CustomerId customerId`; both `SELECT`s in `JdbcBookings` add
    `customer_id` and the shared mapper reads it.
  - `BookingDetail` gains `boolean emailWithheld`; `ViewBookingService.toDetail` computes
    `b.status() == BookingStatus.CONFIRMED && mailDelivery.isWithheld(b.customerId())` — the
    short-circuit **is** the oracle gate.
  - `BookingConfirmation` gains `boolean emailWithheld`; `ReserveOutcome.Reserved` carries the
    `CustomerId` that `ReserveSetService` already builds into `NewBooking`, and
    `CreateBookingService` sets the flag on the `Confirmed` branch only — the `AwaitingPayment`
    and `Requested` branches pass `false`.
  - `BookingDetailView` / `BookingConfirmationView` expose the field; the `202` views are untouched.

- [ ] **Step 4: Run them, verify they pass** — same command → PASS

- [ ] **Step 5: End-of-phase regression** — `./gradlew test --tests "ai.riviera.platform.booking.*"` → PASS

- [ ] **Step 6: Commit** — `git commit -m "feat(#390): expose the withheld-confirmation-mail flag on the confirmed booking read models"`

- [ ] **Step 7: Update the plan-doc execution status** in the same commit window.

---

## Phase 2 — Angular notice on both post-payment surfaces

**Files:** Modify `booking/booking.model.ts`, `booking/booking-confirmation.ts` + `.scss`,
`booking/booking-pay.ts` + `.scss` · Test `booking-confirmation.spec.ts`, `booking-pay.spec.ts`,
the `*.a11y.spec.ts` / `*.contrast.spec.ts` siblings

- [ ] **Step 1: Write the failing specs** (AC-7, AC-8) — assert on a stable
      `data-testid="email-withheld"`, that the "We've also emailed it to you." string is **absent**
      when withheld and **present** when not, and that the notice carries `role="status"`.

- [ ] **Step 2: Run them, verify they fail** — `npm test -- booking-confirmation booking-pay` → FAIL

- [ ] **Step 3: Minimal implementation**
  - `booking.model.ts`: `BookingConfirmation` and `BookingDetail` gain
    `readonly emailWithheld: boolean;`
  - `booking-confirmation.ts`: split the `code-note` sentence; add the notice block.
  - `booking-pay.ts`: capture `emailWithheld` from the polled detail into a signal when the poll
    resolves `CONFIRMED`, and render the same notice in the done panel.
  - Update every fixture the new required field breaks (R-6).

- [ ] **Step 4: Run them, verify they pass** — `npm test` and `npm run test:a11y` → PASS

- [ ] **Step 5: Lint** — `npm run lint` → PASS

- [ ] **Step 6: Commit** — `git commit -m "feat(#390): tell the tourist when the confirmation email was withheld"`

- [ ] **Step 7: Update the plan-doc execution status** in the same commit window.

---

## Phase 3 — Playwright e2e (mocked suite)

**Files:** Create `frontend/e2e/suppressed-confirmation.e2e.ts`

- [ ] **Step 1: Write the failing spec** (AC-9) — route-mock `POST /api/bookings` /
      `GET /api/bookings/*` per the suite's existing helpers; one test asserts the notice is visible
      for a suppressed confirmed booking, one asserts it is absent otherwise. **Mocked suite**
      (`frontend/e2e/`), not `real-backend/` — it needs no live backend and must run in CI (RV-FE-E2E).

- [ ] **Step 2: Run it, verify it fails** — `npm run test:e2e:a11y -- suppressed-confirmation` → FAIL

- [ ] **Step 3: Make it pass** — no product change expected; fix the spec's selectors/mocks.

- [ ] **Step 4: Run the suite** — `npm run test:e2e:a11y` → PASS

- [ ] **Step 5: Commit** — `git commit -m "test(#390): e2e coverage for the withheld-confirmation-email notice"`

- [ ] **Step 6: Update the plan-doc execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1 / AC-2 / AC-3:** `./gradlew test --tests "*ViewBookingServiceTest*"` → PASS
- [ ] **AC-4:** `./gradlew test --tests "*CreateBookingServiceTest*"` → PASS
- [ ] **AC-5 / AC-6:** `./gradlew test --tests "*SuppressedConfirmationMailDeliveryTest*"` → PASS
- [ ] **AC-7 / AC-8:** `npm test` → PASS
- [ ] **AC-9:** `npm run test:e2e:a11y` → PASS
- [ ] **AC-10:** `./gradlew test --tests "*ModularityTests*" --tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*"` → PASS

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (justified `N/A` — read-side only); no new write path.
- [ ] Pool + cutoff rules honored (invariants #3, #4) — untouched.
- [ ] **Modulith** section filled; the new port is in `spi/` not `api/`; no cross-module
      `application.*`/`adapter.*` imports; `booking` gains no dependency (invariant #11).
- [ ] **Payment/payout** section filled (`N/A`); confirmation still webhook-driven (invariant #8).
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone untouched (invariant #6).
- [ ] Booking codes unguessable and never logged (invariant #7).
- [ ] No Flyway migration needed; no schema change (invariant #12).
- [ ] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty.
- [ ] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing
      `merged via PR #NN`.
- [ ] **The review gate ran in full** — `/code-review` *plus* `riviera-review-overlay`.
