package ai.riviera.platform.booking.application.request;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import ai.riviera.platform.customer.api.CustomerLookup;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.Money;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.QueryTimeoutException;

import ai.riviera.platform.booking.events.BookingPaymentDue;
import ai.riviera.platform.booking.events.BookingRequestDeclined;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.DeclineReason;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.application.BookingCutoff;
import ai.riviera.platform.booking.application.cancel.CancellationPolicy;
import ai.riviera.platform.booking.application.refund.ReleaseAbandonedBooking;
import ai.riviera.platform.booking.application.reserve.ClaimRef;
import ai.riviera.platform.booking.application.reserve.ConfirmBooking;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.vocabulary.CancellationWindow;
import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.availability.vocabulary.ClaimOutcome;
import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.vocabulary.NotVenueOwnerException;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.payment.api.CheckoutPort;
import ai.riviera.platform.payment.vocabulary.PaymentOutcome;
import ai.riviera.platform.venue.api.SetBookingFacts;
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
	private static final SetId SET = new SetId(11);
	private static final LocalDate BOOKING_DATE = LocalDate.of(2026, 8, 1);
	private static final Instant NOW = Instant.parse("2026-07-10T08:00:00Z");
	private static final Instant CREATED_AT = Instant.parse("2026-07-08T09:00:00Z");
	private static final Duration PAY_WINDOW = Duration.ofHours(12);
	private static final RequestWindows WINDOWS = new RequestWindows(Duration.ofHours(24), PAY_WINDOW);

	private final VenueOwnership ownership = mock(VenueOwnership.class);
	private final Bookings bookings = mock(Bookings.class);
	private final AvailabilityClaim availability = mock(AvailabilityClaim.class);
	private final CheckoutPort checkout = mock(CheckoutPort.class);
	private final ConfirmBooking confirmBooking = mock(ConfirmBooking.class);
	private final ReleaseAbandonedBooking releaseAbandoned = mock(ReleaseAbandonedBooking.class);
	private final ApplicationEventPublisher publisher = mock(ApplicationEventPublisher.class);
	private final Clock clock = Clock.fixed(NOW, ZoneId.of("UTC"));

	/** The birth-window quote every accept stamps onto {@code BookingPaymentDue} (#795). */
	private final CancellationPolicy cancellationPolicy = mock(CancellationPolicy.class);

	{
		when(cancellationPolicy.windowAtBirth(any(), any(), any())).thenReturn(
				Optional.of(new CancellationPolicy.BirthTerms(CancellationWindow.LATE, 2500)));
		// ADR-0025: the accept reads the pending span, claims it, then transitions.
		when(bookings.findPendingRequestSpan(BOOKING.value(), VENUE))
				.thenReturn(Optional.of(new ClaimRef(SET, BOOKING_DATE, BOOKING_DATE)));
		when(availability.claim(any(), any())).thenReturn(ClaimOutcome.CLAIMED);
	}

	private RespondToRequestService service() {
		return serviceOn(clock);
	}

	private RespondToRequestService serviceOn(Clock at) {
		return new RespondToRequestService(ownership, bookings,
				new RequestTerminationService(bookings, publisher),
				new RequestClaimService(bookings, availability, mock(SetBookingFacts.class), publisher), checkout,
				confirmBooking,
				releaseAbandoned, new PaymentDueAnnouncer(publisher), WINDOWS, new BookingCutoff(at),
				cancellationPolicy, at);
	}

	/** The facts the guarded accept transition RETURNINGs — every one of them a payload field. */
	private static AcceptedRequest acceptedRequest() {
		return new AcceptedRequest(BOOKING.value(), VENUE, SET, BOOKING_DATE, BOOKING_DATE, NOW, CREATED_AT, 4500L, "EUR");
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
				.thenReturn(Optional.of(acceptedRequest()));
		when(checkout.pay(any(), any())).thenReturn(new PaymentOutcome.Pending("cs_x", "pi_x"));

		AcceptOutcome outcome = service().accept(OPERATOR, VENUE, BOOKING);

		AcceptOutcome.Accepted accepted = assertInstanceOf(AcceptOutcome.Accepted.class, outcome);
		assertEquals(BookingStatus.AWAITING_PAYMENT, accepted.status(),
				"real Stripe: the webhook confirms, never the accept response (invariant #8)");
		verify(checkout).pay(
				eq(new BookingRef(BOOKING.value())),
				eq(new Money(4500L, "EUR")));
		verify(confirmBooking, never()).confirm(anyLong(), any());
	}

	@Test
	void publishesPaymentDueWhenCollectionIsPending() {
		// The one branch that owes anything: registered intent, webhook not yet spoken (invariant #8).
		when(bookings.acceptPendingRequest(BOOKING.value(), VENUE, NOW))
				.thenReturn(Optional.of(acceptedRequest()));
		when(checkout.pay(any(), any())).thenReturn(new PaymentOutcome.Pending("cs_x", "pi_x"));

		service().accept(OPERATOR, VENUE, BOOKING);

		verify(publisher).publishEvent((Object) new BookingPaymentDue(BOOKING, VENUE, SET, BOOKING_DATE, BOOKING_DATE,
				NOW.plus(PAY_WINDOW), 4500L, "EUR", CancellationWindow.LATE, 2500));
		// The classification keys on the booking's birth, not the accept instant (#795 S-5).
		verify(cancellationPolicy).windowAtBirth(SET, BOOKING_DATE, CREATED_AT);
	}

	@Test
	void announcesAPayDeadlineCappedAtTheEndOfTheServiceDay() {
		// Same-day accept at 17:30 Tirane, 12h window crossing midnight: the day's end wins (#792).
		Instant onDayAccept = Instant.parse("2026-07-11T15:30:00Z");
		LocalDate today = LocalDate.of(2026, 7, 11);
		Clock atAccept = Clock.fixed(onDayAccept, ZoneId.of("UTC"));
		when(bookings.acceptPendingRequest(BOOKING.value(), VENUE, onDayAccept)).thenReturn(
				Optional.of(new AcceptedRequest(BOOKING.value(), VENUE, SET, today, today, onDayAccept,
						CREATED_AT, 4500L, "EUR")));
		when(checkout.pay(any(), any())).thenReturn(new PaymentOutcome.Pending("cs_x", "pi_x"));

		serviceOn(atAccept).accept(OPERATOR, VENUE, BOOKING);

		Instant serviceDayEndsAt = Instant.parse("2026-07-11T22:00:00Z");
		assertTrue(serviceDayEndsAt.isBefore(onDayAccept.plus(PAY_WINDOW)),
				"the raw window must genuinely outrun the service day's end, or this pins nothing");
		verify(publisher).publishEvent((Object) new BookingPaymentDue(BOOKING, VENUE, SET, today, today,
				serviceDayEndsAt, 4500L, "EUR", CancellationWindow.LATE, 2500));
	}

	@Test
	void announcesTheRawDeadlineForAnEarlyAcceptInsideTheServiceDay() {
		// Accepted 08:00 Tirane on D itself: the window ends 20:00, inside the day — legal now (#792).
		Instant onDayAccept = Instant.parse("2026-07-11T06:00:00Z");
		LocalDate today = LocalDate.of(2026, 7, 11);
		Clock atAccept = Clock.fixed(onDayAccept, ZoneId.of("UTC"));
		when(bookings.acceptPendingRequest(BOOKING.value(), VENUE, onDayAccept)).thenReturn(
				Optional.of(new AcceptedRequest(BOOKING.value(), VENUE, SET, today, today, onDayAccept,
						CREATED_AT, 4500L, "EUR")));
		when(checkout.pay(any(), any())).thenReturn(new PaymentOutcome.Pending("cs_x", "pi_x"));

		serviceOn(atAccept).accept(OPERATOR, VENUE, BOOKING);

		verify(publisher).publishEvent((Object) new BookingPaymentDue(BOOKING, VENUE, SET, today, today,
				onDayAccept.plus(PAY_WINDOW), 4500L, "EUR", CancellationWindow.LATE, 2500));
	}

	@Test
	void publishesNoPaymentDueWhenCollectionSucceedsInline() {
		// The stub confirms before this returns, so a "pay by" mail would contradict the confirmation.
		when(bookings.acceptPendingRequest(BOOKING.value(), VENUE, NOW))
				.thenReturn(Optional.of(acceptedRequest()));
		when(checkout.pay(any(), any())).thenReturn(new PaymentOutcome.Succeeded("ok"));

		service().accept(OPERATOR, VENUE, BOOKING);

		verifyNoInteractions(publisher);
	}

	@Test
	void publishesNoPaymentDueWhenPaymentInitFails() {
		// The booking is reverted to PENDING_REQUEST, so there is nothing to pay and no way to pay it.
		when(bookings.acceptPendingRequest(BOOKING.value(), VENUE, NOW))
				.thenReturn(Optional.of(acceptedRequest()));
		when(checkout.pay(any(), any())).thenReturn(new PaymentOutcome.Failed("stripe_error"));

		service().accept(OPERATOR, VENUE, BOOKING);

		verifyNoInteractions(publisher);
	}

	@Test
	void publishesNoPaymentDueWhenPaymentIssuanceThrows() {
		when(bookings.acceptPendingRequest(BOOKING.value(), VENUE, NOW))
				.thenReturn(Optional.of(acceptedRequest()));
		when(checkout.pay(any(), any())).thenThrow(new IllegalStateException("payment row insert failed"));

		assertThrows(IllegalStateException.class, () -> service().accept(OPERATOR, VENUE, BOOKING));

		verifyNoInteractions(publisher);
	}

	@Test
	void aFailedAnnouncementLeavesTheAcceptAccepted() {
		// The accept is committed and the intent issued; failing now would lie and invite a retry.
		when(bookings.acceptPendingRequest(BOOKING.value(), VENUE, NOW))
				.thenReturn(Optional.of(acceptedRequest()));
		when(checkout.pay(any(), any())).thenReturn(new PaymentOutcome.Pending("cs_x", "pi_x"));
		doThrow(new QueryTimeoutException("event_publication insert timed out"))
				.when(publisher).publishEvent(any(Object.class));

		AcceptOutcome outcome = service().accept(OPERATOR, VENUE, BOOKING);

		AcceptOutcome.Accepted accepted = assertInstanceOf(AcceptOutcome.Accepted.class, outcome);
		assertEquals(BookingStatus.AWAITING_PAYMENT, accepted.status());
	}

	@Test
	void acceptOnStubProfileConfirmsSynchronously() {
		when(bookings.acceptPendingRequest(BOOKING.value(), VENUE, NOW))
				.thenReturn(Optional.of(acceptedRequest()));
		when(checkout.pay(any(), any())).thenReturn(new PaymentOutcome.Succeeded("ok"));

		AcceptOutcome outcome = service().accept(OPERATOR, VENUE, BOOKING);

		AcceptOutcome.Accepted accepted = assertInstanceOf(AcceptOutcome.Accepted.class, outcome);
		assertEquals(BookingStatus.CONFIRMED, accepted.status());
		verify(confirmBooking).confirm(BOOKING.value(), NOW);
	}

	@Test
	void failedPaymentRequestRevertsToPendingAndReleasesTheClaim() {
		// The accept claimed the day; the revert gives it back, since a pending request holds nothing (ADR-0025).
		when(bookings.acceptPendingRequest(BOOKING.value(), VENUE, NOW))
				.thenReturn(Optional.of(acceptedRequest()));
		when(checkout.pay(any(), any())).thenReturn(new PaymentOutcome.Failed("stripe_error"));
		when(bookings.revertAcceptToPending(BOOKING.value()))
				.thenReturn(Optional.of(new ClaimRef(SET, BOOKING_DATE, BOOKING_DATE)));

		AcceptOutcome outcome = service().accept(OPERATOR, VENUE, BOOKING);

		assertSame(AcceptOutcome.Rejected.PAYMENT_INIT_FAILED, outcome);
		verify(bookings).revertAcceptToPending(BOOKING.value());
		verify(availability).release(SET, BOOKING_DATE);
		verifyNoInteractions(releaseAbandoned);
	}

	@Test
	void acceptClaimsTheDayBeforeTransitioning() {
		when(bookings.acceptPendingRequest(BOOKING.value(), VENUE, NOW))
				.thenReturn(Optional.of(acceptedRequest()));
		when(checkout.pay(any(), any())).thenReturn(new PaymentOutcome.Pending("cs_x", "pi_x"));

		service().accept(OPERATOR, VENUE, BOOKING);

		var order = org.mockito.Mockito.inOrder(availability, bookings);
		order.verify(availability).claim(SET, BOOKING_DATE);
		order.verify(bookings).acceptPendingRequest(BOOKING.value(), VENUE, NOW);
		verify(availability, never()).release(any(), any());
	}

	@Test
	void acceptOnALostDayDeclinesTheRequestAsSetUnavailable() {
		when(availability.claim(SET, BOOKING_DATE)).thenReturn(ClaimOutcome.ALREADY_TAKEN);
		when(bookings.declinePending(BOOKING.value(), VENUE, DeclineReason.SET_UNAVAILABLE))
				.thenReturn(Optional.of(new ClaimRef(SET, BOOKING_DATE, BOOKING_DATE)));

		AcceptOutcome outcome = service().accept(OPERATOR, VENUE, BOOKING);

		assertSame(AcceptOutcome.Rejected.SET_UNAVAILABLE, outcome);
		verify(publisher).publishEvent(new BookingRequestDeclined(BOOKING, SET, BOOKING_DATE, BOOKING_DATE,
				DeclineReason.SET_UNAVAILABLE));
		verify(bookings, never()).acceptPendingRequest(anyLong(), any(), any());
		verifyNoInteractions(checkout);
	}

	@Test
	void acceptDeclinesEveryOverlappingRival() {
		when(bookings.acceptPendingRequest(BOOKING.value(), VENUE, NOW))
				.thenReturn(Optional.of(acceptedRequest()));
		when(bookings.declineRivals(SET, BOOKING_DATE, BOOKING_DATE, DeclineReason.ANOTHER_GUEST))
				.thenReturn(List.of(new DeclinedRival(77, SET, BOOKING_DATE, BOOKING_DATE, null),
						new DeclinedRival(78, SET, BOOKING_DATE, BOOKING_DATE, null)));
		when(checkout.pay(any(), any())).thenReturn(new PaymentOutcome.Succeeded("ok"));

		service().accept(OPERATOR, VENUE, BOOKING);

		verify(publisher).publishEvent(new BookingRequestDeclined(new BookingId(77), SET, BOOKING_DATE, BOOKING_DATE,
				DeclineReason.ANOTHER_GUEST));
		verify(publisher).publishEvent(new BookingRequestDeclined(new BookingId(78), SET, BOOKING_DATE, BOOKING_DATE,
				DeclineReason.ANOTHER_GUEST));
	}

	@Test
	void aRowThatLeftPendingUnderTheClaimGivesItBack() {
		// Withdrawn or swept between the read and the transition: the claim is released and the miss classified.
		when(bookings.acceptPendingRequest(BOOKING.value(), VENUE, NOW)).thenReturn(Optional.empty());
		when(bookings.requestSnapshot(BOOKING.value(), VENUE)).thenReturn(Optional.of(
				new RequestSnapshot(BookingStatus.WITHDRAWN, NOW.plusSeconds(600))));

		assertSame(AcceptOutcome.Rejected.NOT_PENDING, service().accept(OPERATOR, VENUE, BOOKING));
		verify(availability).release(SET, BOOKING_DATE);
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
	void declineReleasesNothing() {
		SetId set = new SetId(11);
		var date = LocalDate.of(2026, 8, 1);
		when(bookings.declinePending(BOOKING.value(), VENUE, DeclineReason.VENUE))
				.thenReturn(Optional.of(new ClaimRef(set, date, date)));

		DeclineOutcome outcome = service().decline(OPERATOR, VENUE, BOOKING);

		assertInstanceOf(DeclineOutcome.Declined.class, outcome);
		verify(publisher).publishEvent(new BookingRequestDeclined(BOOKING, set, date, date, DeclineReason.VENUE));
		verifyNoInteractions(checkout, availability);
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
		when(bookings.declinePending(BOOKING.value(), VENUE, DeclineReason.VENUE)).thenReturn(Optional.empty());
		when(bookings.requestSnapshot(BOOKING.value(), VENUE)).thenReturn(Optional.of(
				new RequestSnapshot(BookingStatus.CONFIRMED, null)));

		assertSame(DeclineOutcome.Rejected.NOT_PENDING, service().decline(OPERATOR, VENUE, BOOKING));
	}

	@Test
	void expirySweepExpiresEveryOverdueRequestAndReleasesNothing() {
		// ExpireRequestsService: per-row guarded expiry (failure-isolated); nothing was held (ADR-0025).
		var date = LocalDate.of(2026, 8, 2);
		when(bookings.findOverduePendingRequests(NOW))
				.thenReturn(List.of(new BookingId(11), new BookingId(12)));
		when(bookings.expirePendingRequest(11, NOW))
				.thenReturn(Optional.of(new ClaimRef(new SetId(1), date, date)));
		when(bookings.expirePendingRequest(12, NOW))
				.thenReturn(Optional.of(new ClaimRef(new SetId(2), date, date)));

		int expired = new ExpireRequestsService(bookings,
				new RequestTerminationService(bookings, publisher), clock).sweep();

		assertEquals(2, expired);
		verifyNoInteractions(availability);
	}

	@Test
	void expirySweepIsolatesAFailingRow() {
		// One poisoned row must not starve the batch (mirrors the abandoned sweep's isolation).
		var date = LocalDate.of(2026, 8, 2);
		when(bookings.findOverduePendingRequests(NOW))
				.thenReturn(List.of(new BookingId(11), new BookingId(12)));
		when(bookings.expirePendingRequest(11, NOW))
				.thenThrow(new org.springframework.dao.QueryTimeoutException("release blocked"));
		when(bookings.expirePendingRequest(12, NOW))
				.thenReturn(Optional.of(new ClaimRef(new SetId(2), date, date)));

		int expired = new ExpireRequestsService(bookings,
				new RequestTerminationService(bookings, publisher), clock).sweep();

		assertEquals(1, expired, "the healthy row is still expired");
		verifyNoInteractions(availability);
	}

	@Test
	void pendingQueueChecksOwnershipAndResolvesGuestNames() {
		var lookup = mock(CustomerLookup.class);
		var customerId = new CustomerId(5);
		when(bookings.findPendingRequestsForVenue(VENUE)).thenReturn(List.of(new PendingRequestRow(
				BOOKING.value(), new SetId(3), java.time.LocalDate.of(2026, 8, 3), java.time.LocalDate.of(2026, 8, 3),
				customerId,
				4500L, "EUR", NOW.minusSeconds(3600), NOW.plusSeconds(3600), 0, null, 0)));
		when(lookup.findByIds(java.util.Set.of(customerId))).thenReturn(java.util.Map.of(customerId,
				new ai.riviera.platform.customer.vocabulary.GuestContact("g@e.com", "Guest Name", "+355")));

		var queue = new PendingRequestsService(ownership, bookings, lookup).forVenue(OPERATOR, VENUE);

		verify(ownership).assertOwns(eq(OPERATOR), eq(new VenueRef(VENUE.value())));
		assertEquals(1, queue.size());
		assertEquals("Guest Name", queue.getFirst().guestName());
		assertTrue(((PendingRequest.Lone) queue.getFirst()).requestExpiresAt().isAfter(NOW), "deadline carried through");
	}
}
