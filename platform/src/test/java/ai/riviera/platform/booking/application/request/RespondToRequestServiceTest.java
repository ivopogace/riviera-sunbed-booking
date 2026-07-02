package ai.riviera.platform.booking.application.request;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.application.refund.ReleaseAbandonedBooking;
import ai.riviera.platform.booking.application.reserve.ClaimRef;
import ai.riviera.platform.booking.application.reserve.ConfirmBooking;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.vocabulary.NotVenueOwnerException;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.payment.api.CheckoutPort;
import ai.riviera.platform.payment.vocabulary.PaymentOutcome;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Branch coverage for the accept/decline orchestration (issue #98) with mocks — no Spring, no DB
 * (the guarded-SQL semantics are proven by {@code RequestAcceptPayIT}/{@code
 * RequestExpiryVsAcceptRaceIT} against real Postgres). Proves: the ownership check is the FIRST
 * act (invariant #13), accept issues the payment request only after the transition, a Failed
 * PaymentIntent reverts to {@code PENDING_REQUEST} (never releases the hold), a missed transition
 * classifies without leaking foreign bookings, and decline releases exactly via the transactional
 * seam.
 */
class RespondToRequestServiceTest {

	private static final OperatorId OPERATOR = new OperatorId(7);
	private static final VenueId VENUE = new VenueId(1);
	private static final BookingId BOOKING = new BookingId(42);
	private static final Instant NOW = Instant.parse("2026-07-10T08:00:00Z");

	private final VenueOwnership ownership = mock(VenueOwnership.class);
	private final Bookings bookings = mock(Bookings.class);
	private final AvailabilityClaim availability = mock(AvailabilityClaim.class);
	private final CheckoutPort checkout = mock(CheckoutPort.class);
	private final ConfirmBooking confirmBooking = mock(ConfirmBooking.class);
	private final ReleaseAbandonedBooking releaseAbandoned = mock(ReleaseAbandonedBooking.class);
	private final Clock clock = Clock.fixed(NOW, ZoneId.of("UTC"));

	private RespondToRequestService service() {
		return new RespondToRequestService(ownership, bookings,
				new RequestReleaseService(bookings, availability), checkout, confirmBooking,
				releaseAbandoned, clock);
	}

	@Test
	void acceptChecksOwnershipBeforeAnythingElse() {
		doThrow(new NotVenueOwnerException(OPERATOR, new VenueRef(VENUE.value())))
				.when(ownership).assertOwns(eq(OPERATOR), any(VenueRef.class));

		assertThrows(NotVenueOwnerException.class, () -> service().accept(OPERATOR, VENUE, BOOKING));

		verifyNoInteractions(bookings, checkout, confirmBooking);
	}

	@Test
	void acceptTransitionsThenIssuesPaymentRequest() {
		when(bookings.acceptPendingRequest(BOOKING.value(), VENUE, NOW))
				.thenReturn(Optional.of(new AcceptedRequest(BOOKING.value(), 4500L, "EUR")));
		when(checkout.pay(any(), any())).thenReturn(new PaymentOutcome.Pending("cs_x", "pi_x"));

		AcceptOutcome outcome = service().accept(OPERATOR, VENUE, BOOKING);

		AcceptOutcome.Accepted accepted = assertInstanceOf(AcceptOutcome.Accepted.class, outcome);
		assertEquals(BookingStatus.AWAITING_PAYMENT, accepted.status(),
				"real Stripe: the webhook confirms, never the accept response (invariant #8)");
		verify(checkout).pay(
				eq(new ai.riviera.platform.payment.vocabulary.BookingRef(BOOKING.value())),
				eq(new ai.riviera.platform.payment.vocabulary.Money(4500L, "EUR")));
		verify(confirmBooking, never()).confirm(anyLong(), any());
	}

	@Test
	void acceptOnStubProfileConfirmsSynchronously() {
		when(bookings.acceptPendingRequest(BOOKING.value(), VENUE, NOW))
				.thenReturn(Optional.of(new AcceptedRequest(BOOKING.value(), 4500L, "EUR")));
		when(checkout.pay(any(), any())).thenReturn(new PaymentOutcome.Succeeded("ok"));

		AcceptOutcome outcome = service().accept(OPERATOR, VENUE, BOOKING);

		AcceptOutcome.Accepted accepted = assertInstanceOf(AcceptOutcome.Accepted.class, outcome);
		assertEquals(BookingStatus.CONFIRMED, accepted.status());
		verify(confirmBooking).confirm(BOOKING.value(), NOW);
	}

	@Test
	void failedPaymentRequestRevertsToPendingAndKeepsTheHold() {
		// R-4: the venue said yes — a PI-creation failure must NOT release the (set, date); it
		// reverts so the operator can retry (the idempotency key makes the retry replay-safe).
		when(bookings.acceptPendingRequest(BOOKING.value(), VENUE, NOW))
				.thenReturn(Optional.of(new AcceptedRequest(BOOKING.value(), 4500L, "EUR")));
		when(checkout.pay(any(), any())).thenReturn(new PaymentOutcome.Failed("stripe_error"));
		when(bookings.revertAcceptToPending(BOOKING.value())).thenReturn(true);

		AcceptOutcome outcome = service().accept(OPERATOR, VENUE, BOOKING);

		assertSame(AcceptOutcome.Rejected.PAYMENT_INIT_FAILED, outcome);
		verify(bookings).revertAcceptToPending(BOOKING.value());
		verifyNoInteractions(availability, releaseAbandoned);
	}

	@Test
	void expiredRequestCannotBeAccepted() {
		when(bookings.acceptPendingRequest(BOOKING.value(), VENUE, NOW)).thenReturn(Optional.empty());
		when(bookings.requestSnapshot(BOOKING.value(), VENUE)).thenReturn(Optional.of(
				new RequestSnapshot(BookingStatus.PENDING_REQUEST, NOW.minusSeconds(60))));

		assertSame(AcceptOutcome.Rejected.EXPIRED, service().accept(OPERATOR, VENUE, BOOKING));
		verifyNoInteractions(checkout);
	}

	@Test
	void alreadyDecidedRequestCannotBeAccepted() {
		when(bookings.acceptPendingRequest(BOOKING.value(), VENUE, NOW)).thenReturn(Optional.empty());
		when(bookings.requestSnapshot(BOOKING.value(), VENUE)).thenReturn(Optional.of(
				new RequestSnapshot(BookingStatus.DECLINED, NOW.plusSeconds(600))));

		assertSame(AcceptOutcome.Rejected.NOT_PENDING, service().accept(OPERATOR, VENUE, BOOKING));
	}

	@Test
	void unknownOrForeignBookingReadsAsNoSuchRequest() {
		when(bookings.acceptPendingRequest(BOOKING.value(), VENUE, NOW)).thenReturn(Optional.empty());
		when(bookings.requestSnapshot(BOOKING.value(), VENUE)).thenReturn(Optional.empty());

		assertSame(AcceptOutcome.Rejected.NO_SUCH_REQUEST, service().accept(OPERATOR, VENUE, BOOKING));
	}

	@Test
	void declineReleasesHold() {
		SetId set = new SetId(11);
		var date = java.time.LocalDate.of(2026, 8, 1);
		when(bookings.declinePending(BOOKING.value(), VENUE))
				.thenReturn(Optional.of(new ClaimRef(set, date)));

		DeclineOutcome outcome = service().decline(OPERATOR, VENUE, BOOKING);

		assertInstanceOf(DeclineOutcome.Declined.class, outcome);
		verify(availability).release(set, date);
		verifyNoInteractions(checkout);
	}

	@Test
	void declineChecksOwnershipFirst() {
		doThrow(new NotVenueOwnerException(OPERATOR, new VenueRef(VENUE.value())))
				.when(ownership).assertOwns(eq(OPERATOR), any(VenueRef.class));

		assertThrows(NotVenueOwnerException.class, () -> service().decline(OPERATOR, VENUE, BOOKING));
		verifyNoInteractions(bookings, availability);
	}

	@Test
	void declineOfDecidedRequestIsNotPending() {
		when(bookings.declinePending(BOOKING.value(), VENUE)).thenReturn(Optional.empty());
		when(bookings.requestSnapshot(BOOKING.value(), VENUE)).thenReturn(Optional.of(
				new RequestSnapshot(BookingStatus.CONFIRMED, null)));

		assertSame(DeclineOutcome.Rejected.NOT_PENDING, service().decline(OPERATOR, VENUE, BOOKING));
	}

	@Test
	void expirySweepReleasesEveryExpiredHold() {
		// ExpireRequestsService: per-row guarded expiry (failure-isolated), each hold released.
		var date = java.time.LocalDate.of(2026, 8, 2);
		when(bookings.findOverduePendingRequests(NOW))
				.thenReturn(List.of(new BookingId(11), new BookingId(12)));
		when(bookings.expirePendingRequest(11, NOW))
				.thenReturn(Optional.of(new ClaimRef(new SetId(1), date)));
		when(bookings.expirePendingRequest(12, NOW))
				.thenReturn(Optional.of(new ClaimRef(new SetId(2), date)));

		int expired = new ExpireRequestsService(bookings,
				new RequestReleaseService(bookings, availability), clock).sweep();

		assertEquals(2, expired);
		verify(availability).release(new SetId(1), date);
		verify(availability).release(new SetId(2), date);
	}

	@Test
	void expirySweepIsolatesAFailingRow() {
		// One poisoned row must not starve the batch (mirrors the abandoned sweep's isolation).
		var date = java.time.LocalDate.of(2026, 8, 2);
		when(bookings.findOverduePendingRequests(NOW))
				.thenReturn(List.of(new BookingId(11), new BookingId(12)));
		when(bookings.expirePendingRequest(11, NOW))
				.thenThrow(new org.springframework.dao.QueryTimeoutException("release blocked"));
		when(bookings.expirePendingRequest(12, NOW))
				.thenReturn(Optional.of(new ClaimRef(new SetId(2), date)));

		int expired = new ExpireRequestsService(bookings,
				new RequestReleaseService(bookings, availability), clock).sweep();

		assertEquals(1, expired, "the healthy row is still expired");
		verify(availability).release(new SetId(2), date);
	}

	@Test
	void pendingQueueChecksOwnershipAndResolvesGuestNames() {
		var lookup = mock(ai.riviera.platform.customer.api.CustomerLookup.class);
		var customerId = new ai.riviera.platform.customer.vocabulary.CustomerId(5);
		when(bookings.findPendingRequestsForVenue(VENUE)).thenReturn(List.of(new PendingRequestRow(
				BOOKING.value(), new SetId(3), java.time.LocalDate.of(2026, 8, 3), customerId,
				4500L, "EUR", NOW.minusSeconds(3600), NOW.plusSeconds(3600))));
		when(lookup.findById(customerId)).thenReturn(Optional.of(
				new ai.riviera.platform.customer.vocabulary.GuestContact("g@e.com", "Guest Name", "+355")));

		var queue = new PendingRequestsService(ownership, bookings, lookup).forVenue(OPERATOR, VENUE);

		verify(ownership).assertOwns(eq(OPERATOR), eq(new VenueRef(VENUE.value())));
		assertEquals(1, queue.size());
		assertEquals("Guest Name", queue.getFirst().guestName());
		assertTrue(queue.getFirst().requestExpiresAt().isAfter(NOW), "deadline carried through");
	}
}
