package ai.riviera.platform.booking.application.refund;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.application.cancel.CancelledBooking;
import ai.riviera.platform.booking.events.BookingCancelled;
import ai.riviera.platform.booking.events.BookingDayRefunded;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.vocabulary.NotVenueOwnerException;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * The venue day refund's decisions at the seams where the ports are mocks (ADR-0027): ownership before
 * any read (#13), the leg per booking shape, the day's own rate, released only for a non-past day, the
 * refusals as values, and a lost race classified off the committed day. {@code VenueDayRefundServiceIT}
 * proves the same against Postgres.
 */
class VenueDayRefundServiceTest {

	private static final OperatorId ACTOR = new OperatorId(11L);
	private static final VenueId VENUE = new VenueId(1L);
	private static final SetId SET = new SetId(2L);
	private static final String CODE = "STAY12345";
	/** 2026-07-20 09:00 Tirane. */
	private static final Clock NOW = Clock.fixed(Instant.parse("2026-07-20T07:00:00Z"), ZoneId.of("UTC"));
	private static final LocalDate TODAY = LocalDate.of(2026, 7, 20);
	private static final LocalDate FIRST = LocalDate.of(2026, 7, 18);
	private static final LocalDate LAST = LocalDate.of(2026, 7, 22);

	private final Bookings bookings = mock(Bookings.class);
	private final AvailabilityClaim availability = mock(AvailabilityClaim.class);
	private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
	private final VenueOwnership ownership = mock(VenueOwnership.class);

	private final VenueDayRefundService service =
			new VenueDayRefundService(bookings, availability, events, NOW, ownership);

	/** A 5-day stay at 25 000 (5 000 a day), no stamps on {@code day}. */
	private static RefundableBooking stay(boolean attended, boolean refunded) {
		return new RefundableBooking(42L, 25000L, "EUR", FIRST, LAST, SET, new StayId(9L), attended, refunded);
	}

	private static RefundableBooking loneOneDay() {
		return new RefundableBooking(43L, 4500L, "EUR", FIRST, FIRST, SET, null, false, false);
	}

	private void found(LocalDate day, RefundableBooking candidate) {
		when(bookings.findRefundableByCode(CODE, VENUE, day)).thenReturn(Optional.of(candidate));
	}

	@Test
	void ownershipIsAssertedBeforeAnyRead() {
		doThrow(new NotVenueOwnerException(ACTOR, new VenueRef(1L))).when(ownership).assertOwns(ACTOR, new VenueRef(1L));

		assertThrows(NotVenueOwnerException.class, () -> service.refundDay(ACTOR, VENUE, CODE, TODAY));

		verifyNoInteractions(bookings, availability, events);
	}

	@Test
	void anUnknownOrForeignCodeIsNotFound() {
		when(bookings.findRefundableByCode(CODE, VENUE, TODAY)).thenReturn(Optional.empty());

		assertInstanceOf(VenueDayRefundOutcome.NotFound.class, service.refundDay(ACTOR, VENUE, CODE, TODAY));

		verify(bookings, never()).refundDay(anyLong(), any(), anyLong(), any(), any());
		verifyNoInteractions(availability, events);
	}

	@Test
	void aStaysDayTodayIsRefundedAtItsRateReleasedAndPublished() {
		found(TODAY, stay(false, false));
		when(bookings.refundDay(42L, TODAY, 5000L, NOW.instant(), DayRefundStamp.venue(ACTOR, true)))
				.thenReturn(Optional.of(new DayRefundedBooking(42L, VENUE, SET, "EUR", new StayId(9L))));

		VenueDayRefundOutcome outcome = service.refundDay(ACTOR, VENUE, CODE, TODAY);

		assertEquals(new VenueDayRefundOutcome.DayRefunded(5000L, "EUR", true), outcome);
		verify(availability).release(SET, TODAY);
		verify(events).publishEvent(new BookingDayRefunded(new BookingId(42L), VENUE, SET, TODAY, 5000L, "EUR",
				new StayId(9L), RefundReason.VENUE, true));
		verify(bookings, never()).cancelByVenue(anyLong(), any(), anyLong(), anyLong(), any());
	}

	@Test
	void aFutureDayIsReleasedToo() {
		LocalDate tomorrow = TODAY.plusDays(1);
		found(tomorrow, stay(false, false));
		when(bookings.refundDay(42L, tomorrow, 5000L, NOW.instant(), DayRefundStamp.venue(ACTOR, true)))
				.thenReturn(Optional.of(new DayRefundedBooking(42L, VENUE, SET, "EUR", new StayId(9L))));

		assertEquals(new VenueDayRefundOutcome.DayRefunded(5000L, "EUR", true),
				service.refundDay(ACTOR, VENUE, CODE, tomorrow));
		verify(availability).release(SET, tomorrow);
	}

	/** ADR-0027 §4: a past day is refunded but its claim stays — the sweep's own rule for a past claim. */
	@Test
	void aPastDayIsRefundedButNotReleased() {
		LocalDate yesterday = TODAY.minusDays(1);
		found(yesterday, stay(false, false));
		when(bookings.refundDay(42L, yesterday, 5000L, NOW.instant(), DayRefundStamp.venue(ACTOR, false)))
				.thenReturn(Optional.of(new DayRefundedBooking(42L, VENUE, SET, "EUR", new StayId(9L))));

		VenueDayRefundOutcome outcome = service.refundDay(ACTOR, VENUE, CODE, yesterday);

		assertEquals(new VenueDayRefundOutcome.DayRefunded(5000L, "EUR", false), outcome);
		verifyNoInteractions(availability);
		verify(events).publishEvent(new BookingDayRefunded(new BookingId(42L), VENUE, SET, yesterday, 5000L, "EUR",
				new StayId(9L), RefundReason.VENUE, false));
	}

	/** ADR-0027 §6: the weather refund's one-day leg with reason {@code VENUE}, in full whatever the cutoff. */
	@Test
	void aLoneOneDayBookingIsCancelledWholeWithReasonVenue() {
		found(FIRST, loneOneDay());
		when(bookings.cancelByVenue(43L, NOW.instant(), 4500L, 4500L, RefundReason.VENUE))
				.thenReturn(Optional.of(new CancelledBooking(43L, VENUE, SET, FIRST, FIRST, 4500L, "EUR")));

		VenueDayRefundOutcome outcome = service.refundDay(ACTOR, VENUE, CODE, FIRST);

		assertEquals(new VenueDayRefundOutcome.BookingCancelled(4500L, "EUR"), outcome);
		verify(availability).release(SET, FIRST);
		verify(events).publishEvent(new BookingCancelled(new BookingId(43L), VENUE, SET, FIRST, 4500L, "EUR",
				RefundReason.VENUE, FIRST));
		verify(bookings, never()).refundDay(anyLong(), any(), anyLong(), any(), any());
	}

	@Test
	void anAttendedDayIsRefusedAndSaysSo() {
		found(TODAY, stay(true, false));

		assertInstanceOf(VenueDayRefundOutcome.DayAttended.class, service.refundDay(ACTOR, VENUE, CODE, TODAY));

		verify(bookings, never()).refundDay(anyLong(), any(), anyLong(), any(), any());
		verifyNoInteractions(availability, events);
	}

	@Test
	void anAlreadyRefundedDayIsRefused() {
		found(TODAY, stay(false, true));

		assertInstanceOf(VenueDayRefundOutcome.DayAlreadyRefunded.class,
				service.refundDay(ACTOR, VENUE, CODE, TODAY));

		verify(bookings, never()).refundDay(anyLong(), any(), anyLong(), any(), any());
		verifyNoInteractions(availability, events);
	}

	/** The guarded write moved nothing: the committed day names the refusal, and nothing is released or published. */
	@Test
	void aLostRaceIsClassifiedOffTheCommittedDay() {
		when(bookings.findRefundableByCode(CODE, VENUE, TODAY))
				.thenReturn(Optional.of(stay(false, false)), Optional.of(stay(false, true)));
		when(bookings.refundDay(anyLong(), any(), anyLong(), any(), any())).thenReturn(Optional.empty());

		assertInstanceOf(VenueDayRefundOutcome.DayAlreadyRefunded.class,
				service.refundDay(ACTOR, VENUE, CODE, TODAY));

		verifyNoInteractions(availability, events);
	}

	@Test
	void aLostRaceOnALoneBookingThatVanishedIsNotFound() {
		when(bookings.findRefundableByCode(anyString(), any(), any()))
				.thenReturn(Optional.of(loneOneDay()), Optional.empty());
		when(bookings.cancelByVenue(anyLong(), any(), anyLong(), anyLong(), any())).thenReturn(Optional.empty());

		assertInstanceOf(VenueDayRefundOutcome.NotFound.class, service.refundDay(ACTOR, VENUE, CODE, FIRST));

		verifyNoInteractions(availability, events);
	}
}
