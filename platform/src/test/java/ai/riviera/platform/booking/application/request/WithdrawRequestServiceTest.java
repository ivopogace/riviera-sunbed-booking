package ai.riviera.platform.booking.application.request;

import java.time.LocalDate;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.application.view.BookingRecord;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Branch coverage for the guest withdraw orchestration (issue #123) with mocks — no Spring, no DB
 * (the guarded-SQL semantics, including the deliberate absence of a deadline guard, are proven by
 * {@code WithdrawRequestIT} and {@code ConcurrentRequestTerminationIT} against real Postgres).
 * Proves: a withdrawn request releases its hold exactly once through the transactional seam, a
 * missed transition classifies without releasing anything, and the read that classifies happens
 * only <em>after</em> the transition missed — never before it.
 */
class WithdrawRequestServiceTest {

	private static final String CODE = "ABCD234567";
	private static final long BOOKING_ID = 42;
	private static final SetId SET = new SetId(11);
	private static final LocalDate BOOKING_DATE = LocalDate.of(2026, 8, 1);

	private final Bookings bookings = mock(Bookings.class);
	private final AvailabilityClaim availability = mock(AvailabilityClaim.class);
	private final ApplicationEventPublisher publisher = mock(ApplicationEventPublisher.class);

	private WithdrawRequestService service() {
		return new WithdrawRequestService(bookings, new RequestReleaseService(bookings, availability, publisher));
	}

	@Test
	void withdrawsAndReleasesTheHold() {
		when(bookings.withdrawPendingRequest(CODE))
				.thenReturn(Optional.of(new WithdrawnRequest(BOOKING_ID, SET, BOOKING_DATE)));

		WithdrawOutcome outcome = service().withdraw(CODE);

		assertInstanceOf(WithdrawOutcome.Withdrawn.class, outcome);
		verify(availability).release(SET, BOOKING_DATE);
	}

	@Test
	void doesNotReadTheBookingWhenTheTransitionSucceeded() {
		when(bookings.withdrawPendingRequest(CODE))
				.thenReturn(Optional.of(new WithdrawnRequest(BOOKING_ID, SET, BOOKING_DATE)));

		service().withdraw(CODE);

		// The transition is the decision; the read exists only to explain a 0-row result.
		verify(bookings, never()).findByCode(CODE);
	}

	@Test
	void rejectsANonPendingBooking() {
		when(bookings.withdrawPendingRequest(CODE)).thenReturn(Optional.empty());
		when(bookings.findByCode(CODE)).thenReturn(Optional.of(confirmedRecord()));

		WithdrawOutcome outcome = service().withdraw(CODE);

		assertEquals(WithdrawOutcome.Rejected.NOT_PENDING, outcome);
		verifyNoInteractions(availability);
	}

	@Test
	void rejectsAnUnknownCode() {
		when(bookings.withdrawPendingRequest(CODE)).thenReturn(Optional.empty());
		when(bookings.findByCode(CODE)).thenReturn(Optional.empty());

		WithdrawOutcome outcome = service().withdraw(CODE);

		assertEquals(WithdrawOutcome.Rejected.NO_SUCH_BOOKING, outcome);
		verifyNoInteractions(availability);
	}

	private static BookingRecord confirmedRecord() {
		return new BookingRecord(BOOKING_ID, CODE, BookingStatus.CONFIRMED, new VenueId(1), SET,
				new CustomerId(5), BOOKING_DATE, 4500L, "EUR", null, null, null);
	}
}
