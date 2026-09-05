package ai.riviera.platform.booking.application.cancel;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.context.ApplicationEventPublisher;

import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.application.cancel.CancellationPolicy.RefundQuote;
import ai.riviera.platform.booking.application.view.BookingRecord;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.events.BookingCancelled;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.CancellationWindow;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.venue.vocabulary.BookingMode;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.Pool;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * The guest-cancel fences at the {@link CancelBooking} port, status by status: which statuses read
 * as a spent day, which are refused outright, and the one that proceeds to the transition. The
 * expected side is the literal {@code CONFIRMED} the lifecycle table is itself held to
 * ({@code BookingTransitionTest}), so this service, the table and the guarded write cannot drift
 * apart without a test failing. Pure unit test; the DB-backed transition, the release and the
 * exactly-once publication are {@code CancelBookingIT}'s.
 */
class CancelBookingServiceTest {

	private static final String CODE = "ABCD2345";
	private static final CustomerId GUEST = new CustomerId(7);
	private static final SetId SET = new SetId(2);
	private static final VenueId VENUE = new VenueId(1);
	private static final LocalDate DATE = LocalDate.of(2026, 8, 1);
	private static final Clock NOW = Clock.fixed(Instant.parse("2026-07-20T09:00:00Z"), ZoneId.of("UTC"));

	private final Bookings bookings = mock(Bookings.class);
	private final CancellationPolicy cancellationPolicy = mock(CancellationPolicy.class);
	private final AvailabilityClaim availability = mock(AvailabilityClaim.class);
	private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);

	private final CancelBookingService service =
			new CancelBookingService(bookings, cancellationPolicy, availability, events, NOW);

	/**
	 * Both terminal statuses a service day leaves a booking in render the "its date has already
	 * begun" copy — and neither is quoted, transitioned, released or announced.
	 */
	@ParameterizedTest
	@EnumSource(value = BookingStatus.class, names = {"NO_SHOW", "COMPLETED"})
	void aSpentDayAnswersWindowClosedWhicheverTerminalStatusItCarries(BookingStatus status) {
		givenBooking(status);

		CancelOutcome outcome = service.cancel(CODE);

		assertInstanceOf(CancelOutcome.WindowClosed.class, outcome);
		verifyNoInteractions(cancellationPolicy, availability, events);
		verify(bookings, never()).cancelConfirmed(anyLong(), any(), anyLong());
	}

	@ParameterizedTest
	@EnumSource(value = BookingStatus.class, names = {"CONFIRMED", "NO_SHOW", "COMPLETED"},
			mode = EnumSource.Mode.EXCLUDE)
	void everyOtherStatusIsNotCancellable(BookingStatus status) {
		givenBooking(status);

		CancelOutcome outcome = service.cancel(CODE);

		CancelOutcome.NotCancellable refused =
				assertInstanceOf(CancelOutcome.NotCancellable.class, outcome);
		assertEquals(status, refused.currentStatus(), "the refusal names the status it found");
		verifyNoInteractions(cancellationPolicy, availability, events);
		verify(bookings, never()).cancelConfirmed(anyLong(), any(), anyLong());
	}

	@Test
	void aConfirmedBookingInsideTheWindowIsCancelled() {
		BookingRecord booking = givenBooking(BookingStatus.CONFIRMED);
		when(cancellationPolicy.quote(booking))
				.thenReturn(new RefundQuote(setInfo(), CancellationWindow.FREE, 4500L));
		when(bookings.cancelConfirmed(booking.id(), NOW.instant(), 4500L))
				.thenReturn(Optional.of(new CancelledBooking(booking.id(), VENUE, SET, DATE, 4500L, "EUR")));

		CancelOutcome outcome = service.cancel(CODE);

		CancelOutcome.Cancelled cancelled = assertInstanceOf(CancelOutcome.Cancelled.class, outcome);
		assertEquals(4500L, cancelled.refundMinor());
		assertEquals(CancelOutcome.Tier.FULL, cancelled.tier());
		verify(availability).release(SET, DATE);
		verify(events).publishEvent(new BookingCancelled(new BookingId(booking.id()), VENUE, SET, DATE,
				4500L, "EUR", RefundReason.POLICY));
	}

	private BookingRecord givenBooking(BookingStatus status) {
		BookingRecord record = new BookingRecord(1L, CODE, status, VENUE, SET, GUEST, DATE, 4500L, "EUR",
				null, null, null, null, Instant.EPOCH, null);
		when(bookings.findByCode(CODE)).thenReturn(Optional.of(record));
		return record;
	}

	private static SetBookingInfo setInfo() {
		return new SetBookingInfo(SET, VENUE, "Miramar", "Front row", 2, Pool.ONLINE,
				new MoneyView(4500L, "EUR"), LocalTime.of(18, 0), LocalTime.of(16, 0),
				BookingMode.INSTANT);
	}
}
