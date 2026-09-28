package ai.riviera.platform.booking.application.cancel;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.context.ApplicationEventPublisher;

import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.application.cancel.CancellationPolicy.RefundQuote;
import ai.riviera.platform.booking.application.view.BookingRecord;
import ai.riviera.platform.booking.application.view.StayRecord;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.events.BookingCancelled;
import ai.riviera.platform.booking.events.StayCancelled;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.CancellationWindow;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.venue.vocabulary.BookingMode;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.Pool;
import ai.riviera.platform.venue.vocabulary.SeasonClosure;
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
	private static final String STAY_CODE = "STAY2345";
	private static final SetId OTHER_SET = new SetId(3);
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
		verify(bookings, never()).cancelConfirmed(anyLong(), any(), anyLong(), any(), anyLong());
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
		verify(bookings, never()).cancelConfirmed(anyLong(), any(), anyLong(), any(), anyLong());
	}

	@Test
	void aConfirmedBookingInsideTheWindowIsCancelled() {
		BookingRecord booking = givenBooking(BookingStatus.CONFIRMED);
		when(cancellationPolicy.quote(booking))
				.thenReturn(new RefundQuote(setInfo(), CancellationWindow.FREE, 4500L, RefundReason.POLICY, null));
		when(bookings.cancelConfirmed(booking.id(), NOW.instant(), 4500L, RefundReason.POLICY, 4500L))
				.thenReturn(Optional.of(new CancelledBooking(booking.id(), VENUE, SET, DATE, DATE, 4500L, "EUR")));

		CancelOutcome outcome = service.cancel(CODE);

		CancelOutcome.Cancelled cancelled = assertInstanceOf(CancelOutcome.Cancelled.class, outcome);
		assertEquals(4500L, cancelled.refundMinor());
		assertEquals(CancelOutcome.Tier.FULL, cancelled.tier());
		verify(availability).release(SET, DATE);
		verify(events).publishEvent(new BookingCancelled(new BookingId(booking.id()), VENUE, SET, DATE,
				4500L, "EUR", RefundReason.POLICY));
		verify(events, never()).publishEvent(any(StayCancelled.class));
	}

	@Test
	void aMovedBookingInsideItsFreeExitIsCancelledInFullAsAVenueChange() {
		BookingRecord booking = givenBooking(BookingStatus.CONFIRMED);
		Instant deadline = NOW.instant().plusSeconds(3600);
		when(cancellationPolicy.quote(booking))
				.thenReturn(new RefundQuote(setInfo(), CancellationWindow.LATE, 4500L, RefundReason.VENUE_CHANGE, deadline));
		when(bookings.cancelConfirmed(booking.id(), NOW.instant(), 4500L, RefundReason.VENUE_CHANGE, 4500L))
				.thenReturn(Optional.of(new CancelledBooking(booking.id(), VENUE, SET, DATE, DATE, 4500L, "EUR")));

		CancelOutcome.Cancelled cancelled = assertInstanceOf(CancelOutcome.Cancelled.class, service.cancel(CODE));

		assertEquals(CancelOutcome.Tier.FULL, cancelled.tier());
		verify(events).publishEvent(new BookingCancelled(new BookingId(booking.id()), VENUE, SET, DATE,
				4500L, "EUR", RefundReason.VENUE_CHANGE));
	}

	/**
	 * A stay cancels in one go: every stretch's {@code BookingCancelled} names the stay it was cancelled
	 * with, and one {@link StayCancelled} carries the summed refund the guest's one mail reports.
	 */
	@Test
	void aStayAnnouncesEachStretchStampedAndItsSummedRefundOnce() {
		StayId stay = givenStay(RefundReason.POLICY, 4500L, RefundReason.POLICY, 1125L);

		service.cancel(STAY_CODE);

		verify(events).publishEvent(new BookingCancelled(new BookingId(11L), VENUE, SET, DATE, 4500L, "EUR",
				RefundReason.POLICY, DATE, stay));
		verify(events).publishEvent(new BookingCancelled(new BookingId(12L), VENUE, OTHER_SET, DATE.plusDays(1),
				1125L, "EUR", RefundReason.POLICY, DATE.plusDays(1), stay));
		verify(events).publishEvent(new StayCancelled(stay, 5625L, "EUR", RefundReason.POLICY));
	}

	/** A moved stretch's free exit alone does not make the stay a venue change: the rest is the guest's own cancel. */
	@Test
	void aStayIsAVenueChangeOnlyWhenEveryStretchWas() {
		StayId stay = givenStay(RefundReason.VENUE_CHANGE, 4500L, RefundReason.POLICY, 0L);

		service.cancel(STAY_CODE);

		verify(events).publishEvent(new StayCancelled(stay, 4500L, "EUR", RefundReason.POLICY));
	}

	@Test
	void aStayWhoseEveryStretchWasMovedIsAVenueChange() {
		StayId stay = givenStay(RefundReason.VENUE_CHANGE, 4500L, RefundReason.VENUE_CHANGE, 4500L);

		service.cancel(STAY_CODE);

		verify(events).publishEvent(new StayCancelled(stay, 9000L, "EUR", RefundReason.VENUE_CHANGE));
	}

	/** Two one-day stretches on {@code DATE} and the day after, quoted with {@code firstReason} and {@code secondReason}. */
	private StayId givenStay(RefundReason firstReason, long firstRefund, RefundReason secondReason, long secondRefund) {
		StayId stay = new StayId(5L);
		BookingRecord first = new BookingRecord(11L, STAY_CODE, BookingStatus.CONFIRMED, VENUE, SET, GUEST, DATE, 4500L,
				"EUR", null, null, null, null, Instant.EPOCH, null, null);
		BookingRecord second = new BookingRecord(12L, STAY_CODE, BookingStatus.CONFIRMED, VENUE, OTHER_SET, GUEST,
				DATE.plusDays(1), 4500L, "EUR", null, null, null, null, Instant.EPOCH, null, null);
		when(bookings.findByCode(STAY_CODE)).thenReturn(Optional.empty());
		when(bookings.findStayByCode(STAY_CODE)).thenReturn(Optional.of(
				new StayRecord(stay, STAY_CODE, VENUE, DATE, DATE.plusDays(1), List.of(first, second))));
		when(bookings.lockStretches(stay)).thenReturn(List.of(first, second));
		when(cancellationPolicy.quote(first, DATE)).thenReturn(
				new RefundQuote(setInfo(), CancellationWindow.FREE, firstRefund, firstReason, null));
		when(cancellationPolicy.quote(second, DATE)).thenReturn(
				new RefundQuote(setInfo(), CancellationWindow.FREE, secondRefund, secondReason, null));
		when(bookings.cancelConfirmed(11L, NOW.instant(), firstRefund, firstReason, 4500L))
				.thenReturn(Optional.of(new CancelledBooking(11L, VENUE, SET, DATE, DATE, 4500L, "EUR")));
		when(bookings.cancelConfirmed(12L, NOW.instant(), secondRefund, secondReason, 4500L)).thenReturn(Optional.of(
				new CancelledBooking(12L, VENUE, OTHER_SET, DATE.plusDays(1), DATE.plusDays(1), 4500L, "EUR")));
		return stay;
	}

	private BookingRecord givenBooking(BookingStatus status) {
		BookingRecord record = new BookingRecord(1L, CODE, status, VENUE, SET, GUEST, DATE, 4500L, "EUR",
				null, null, null, null, Instant.EPOCH, null, null);
		when(bookings.findByCode(CODE)).thenReturn(Optional.of(record));
		return record;
	}

	private static SetBookingInfo setInfo() {
		return new SetBookingInfo(SET, VENUE, "Miramar", "Front row", 2, Pool.ONLINE,
				new MoneyView(4500L, "EUR"), LocalTime.of(18, 0), LocalTime.of(16, 0),
				BookingMode.INSTANT, SeasonClosure.open(), null);
	}
}
