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
import org.mockito.ArgumentMatchers;
import org.mockito.InOrder;
import org.springframework.context.ApplicationEventPublisher;

import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.application.cancel.CancellationPolicy.RefundQuote;
import ai.riviera.platform.booking.application.remodel.RemodelReceipts;
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
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.inOrder;
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
	private final RemodelReceipts receipts = mock(RemodelReceipts.class);

	private final CancelBookingService service = new CancelBookingService(bookings, cancellationPolicy, availability,
			events, new LiveRemainder(receipts), NOW);

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

	/** ADR-0027 (#2): a day the venue released may hold another guest's claim — the cancel never frees it. */
	@Test
	void aCancelSkipsTheDaysTheVenueReleased() {
		LocalDate last = DATE.plusDays(2);
		BookingRecord booking = givenBooking(BookingStatus.CONFIRMED);
		when(cancellationPolicy.quote(booking))
				.thenReturn(new RefundQuote(setInfo(), CancellationWindow.FREE, 4500L, RefundReason.POLICY, null));
		when(bookings.cancelConfirmed(booking.id(), NOW.instant(), 4500L, RefundReason.POLICY, 4500L))
				.thenReturn(Optional.of(new CancelledBooking(booking.id(), VENUE, SET, DATE, last, 4500L, "EUR")));
		when(bookings.findReleasedDays(booking.id())).thenReturn(List.of(DATE.plusDays(1)));

		service.cancel(CODE);

		verify(availability).release(SET, DATE);
		verify(availability).release(SET, last);
		verify(availability, never()).release(SET, DATE.plusDays(1));
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
		InOrder lockFirst = inOrder(bookings);
		lockFirst.verify(bookings).lockByCode(CODE);
		lockFirst.verify(bookings).findByCode(CODE);
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

	/**
	 * ADR-0024 §4 as amended (#1290): the stretch a remodel ended (a receipt outcome line) is set aside, the live
	 * rest cancels, judged on the first live day — the second stretch's own day, not the stay's first.
	 */
	@Test
	void aStayCancelSkipsTheStretchARemodelEndedAndQuotesTheRestOnItsFirstLiveDay() {
		StayId stay = givenStay(BookingStatus.CANCELLED, BookingStatus.CONFIRMED);
		when(receipts.endedByRemodel(new BookingId(11L))).thenReturn(true);
		when(cancellationPolicy.quote(second(), DATE.plusDays(1)))
				.thenReturn(new RefundQuote(setInfo(), CancellationWindow.FREE, 4500L, RefundReason.POLICY, null));
		when(bookings.cancelConfirmed(12L, NOW.instant(), 4500L, RefundReason.POLICY, 4500L)).thenReturn(Optional.of(
				new CancelledBooking(12L, VENUE, OTHER_SET, DATE.plusDays(1), DATE.plusDays(1), 4500L, "EUR")));

		CancelOutcome outcome = service.cancel(STAY_CODE);

		assertEquals(new CancelOutcome.Cancelled(4500L, "EUR", CancelOutcome.Tier.FULL), outcome);
		verify(bookings, never()).cancelConfirmed(eq(11L), any(), anyLong(), any(), anyLong());
		verify(cancellationPolicy, never()).quote(any(), eq(DATE));
		verify(availability).release(OTHER_SET, DATE.plusDays(1));
		verify(availability, never()).release(SET, DATE);
		verify(events).publishEvent(new BookingCancelled(new BookingId(12L), VENUE, OTHER_SET, DATE.plusDays(1),
				4500L, "EUR", RefundReason.POLICY, DATE.plusDays(1), stay));
		verify(events, never()).publishEvent(ArgumentMatchers.<Object>argThat(
				event -> event instanceof BookingCancelled cancelled && cancelled.bookingId().value() == 11L));
		verify(events).publishEvent(new StayCancelled(stay, 4500L, "EUR", RefundReason.POLICY));
	}

	/** Only a remodel's ending is set aside: a stretch cancelled with no receipt line still refuses the whole stay. */
	@Test
	void aStretchCancelledWithoutAReceiptLineStillRefusesTheStay() {
		givenStay(BookingStatus.CANCELLED, BookingStatus.CONFIRMED);
		when(receipts.endedByRemodel(new BookingId(11L))).thenReturn(false);

		CancelOutcome outcome = service.cancel(STAY_CODE);

		assertEquals(new CancelOutcome.NotCancellable(BookingStatus.CANCELLED), outcome);
		verifyNoInteractions(cancellationPolicy, availability, events);
		verify(bookings, never()).cancelConfirmed(anyLong(), any(), anyLong(), any(), anyLong());
	}

	@Test
	void aStayEveryStretchOfWhichARemodelEndedIsNotCancellable() {
		givenStay(BookingStatus.CANCELLED, BookingStatus.CANCELLED);
		when(receipts.endedByRemodel(any())).thenReturn(true);

		CancelOutcome outcome = service.cancel(STAY_CODE);

		assertEquals(new CancelOutcome.NotCancellable(BookingStatus.CANCELLED), outcome);
		verifyNoInteractions(cancellationPolicy, availability, events);
		verify(bookings, never()).cancelConfirmed(anyLong(), any(), anyLong(), any(), anyLong());
	}

	/** Two one-day stretches on {@code DATE} and the day after, quoted with {@code firstReason} and {@code secondReason}. */
	private StayId givenStay(RefundReason firstReason, long firstRefund, RefundReason secondReason, long secondRefund) {
		StayId stay = givenStay(BookingStatus.CONFIRMED, BookingStatus.CONFIRMED);
		when(cancellationPolicy.quote(first(), DATE)).thenReturn(
				new RefundQuote(setInfo(), CancellationWindow.FREE, firstRefund, firstReason, null));
		when(cancellationPolicy.quote(second(), DATE)).thenReturn(
				new RefundQuote(setInfo(), CancellationWindow.FREE, secondRefund, secondReason, null));
		when(bookings.cancelConfirmed(11L, NOW.instant(), firstRefund, firstReason, 4500L))
				.thenReturn(Optional.of(new CancelledBooking(11L, VENUE, SET, DATE, DATE, 4500L, "EUR")));
		when(bookings.cancelConfirmed(12L, NOW.instant(), secondRefund, secondReason, 4500L)).thenReturn(Optional.of(
				new CancelledBooking(12L, VENUE, OTHER_SET, DATE.plusDays(1), DATE.plusDays(1), 4500L, "EUR")));
		return stay;
	}

	/** Two one-day stretches on {@code DATE} and the day after, in the given statuses, found and locked by the stay's code. */
	private StayId givenStay(BookingStatus firstStatus, BookingStatus secondStatus) {
		StayId stay = new StayId(5L);
		List<BookingRecord> stretches = List.of(stretch(11L, firstStatus, SET, DATE),
				stretch(12L, secondStatus, OTHER_SET, DATE.plusDays(1)));
		when(bookings.findByCode(STAY_CODE)).thenReturn(Optional.empty());
		when(bookings.findStayByCode(STAY_CODE)).thenReturn(Optional.of(
				new StayRecord(stay, STAY_CODE, VENUE, DATE, DATE.plusDays(1), stretches)));
		when(bookings.lockStretches(stay)).thenReturn(stretches);
		return stay;
	}

	private static BookingRecord first() {
		return stretch(11L, BookingStatus.CONFIRMED, SET, DATE);
	}

	private static BookingRecord second() {
		return stretch(12L, BookingStatus.CONFIRMED, OTHER_SET, DATE.plusDays(1));
	}

	private static BookingRecord stretch(long id, BookingStatus status, SetId set, LocalDate day) {
		return new BookingRecord(id, STAY_CODE, status, VENUE, set, GUEST, day, 4500L, "EUR", null, null, null, null,
				Instant.EPOCH, null, null);
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
