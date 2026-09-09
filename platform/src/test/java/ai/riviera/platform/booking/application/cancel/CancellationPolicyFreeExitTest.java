package ai.riviera.platform.booking.application.cancel;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Optional;
import java.util.OptionalInt;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.booking.application.BookingCutoff;
import ai.riviera.platform.booking.application.cancel.CancellationPolicy.RefundQuote;
import ai.riviera.platform.booking.application.view.BookingRecord;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.vocabulary.CancellationWindow;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.venue.api.SetBookingFacts;
import ai.riviera.platform.venue.api.VenueRates;
import ai.riviera.platform.venue.vocabulary.BookingMode;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.Pool;
import ai.riviera.platform.venue.vocabulary.SeasonClosure;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * The free-exit override (invariant #10): a moved booking quoted inside the LATE window before its
 * deadline refunds in full with reason {@code VENUE_CHANGE}; after the deadline the venue's late share
 * applies with reason {@code POLICY}; a CLOSED window stays closed; an unmoved booking keeps the
 * policy's own answer; a moved one still in the FREE window is full either way and names the exit.
 */
class CancellationPolicyFreeExitTest {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");
	private static final VenueId VENUE = new VenueId(3);
	private static final SetId SET = new SetId(12);
	private static final LocalDate DAY = LocalDate.of(2026, 9, 12);
	/** 15:00 Tirane two days out: the deadline is 24h later — inside the LATE window the 10:00 cutoff opens. */
	private static final Instant MOVED_AT = tirane(9, 10, 15, 0);

	private final SetBookingFacts setFacts = mock(SetBookingFacts.class);
	private final VenueRates rates = mock(VenueRates.class);

	private static Instant tirane(int month, int day, int hour, int minute) {
		return ZonedDateTime.of(2026, month, day, hour, minute, 0, 0, TIRANE).toInstant();
	}

	private CancellationPolicy policyAt(Instant now) {
		when(setFacts.setBookingInfo(SET)).thenReturn(Optional.of(new SetBookingInfo(SET, VENUE, "Miramar",
				"A", 2, Pool.ONLINE, new MoneyView(4500L, "EUR"), LocalTime.of(10, 0), LocalTime.of(16, 0),
				BookingMode.INSTANT, SeasonClosure.open())));
		when(rates.lateCancelRefundBps(VENUE)).thenReturn(OptionalInt.of(2500));
		Clock clock = Clock.fixed(now, ZoneId.of("UTC"));
		return new CancellationPolicy(setFacts, rates, new BookingCutoff(clock), clock);
	}

	private static BookingRecord booking(Instant movedAt) {
		return new BookingRecord(1L, "CODE", BookingStatus.CONFIRMED, VENUE, SET, new CustomerId(5), DAY,
				4500L, "EUR", null, null, null, null, Instant.EPOCH, null, movedAt);
	}

	@Test
	void insideTheLateWindowBeforeTheDeadlineTheExitRefundsInFullAsAVenueChange() {
		RefundQuote quote = policyAt(tirane(9, 11, 12, 0)).quote(booking(MOVED_AT));

		assertEquals(CancellationWindow.LATE, quote.window());
		assertEquals(4500L, quote.refundMinor());
		assertEquals(RefundReason.VENUE_CHANGE, quote.reason());
		assertEquals(tirane(9, 11, 15, 0), quote.freeExitUntil());
	}

	@Test
	void afterTheDeadlineTheLateShareAppliesAgain() {
		RefundQuote quote = policyAt(tirane(9, 11, 15, 0)).quote(booking(MOVED_AT));

		assertEquals(CancellationWindow.LATE, quote.window());
		assertEquals(1125L, quote.refundMinor());
		assertEquals(RefundReason.POLICY, quote.reason());
		assertNull(quote.freeExitUntil());
	}

	@Test
	void aClosedWindowIsNeverReopened() {
		RefundQuote quote = policyAt(tirane(9, 12, 0, 30)).quote(booking(tirane(9, 11, 23, 0)));

		assertEquals(CancellationWindow.CLOSED, quote.window());
		assertFalse(quote.cancellationOpen());
		assertEquals(0L, quote.refundMinor());
		assertNull(quote.freeExitUntil());
	}

	@Test
	void anUnmovedBookingKeepsThePolicysAnswer() {
		RefundQuote quote = policyAt(tirane(9, 11, 12, 0)).quote(booking(null));

		assertEquals(1125L, quote.refundMinor());
		assertEquals(RefundReason.POLICY, quote.reason());
		assertNull(quote.freeExitUntil());
	}

	@Test
	void aMovedBookingStillInTheFreeWindowIsFullAndNamesTheExitWithItsDeadline() {
		RefundQuote quote = policyAt(tirane(9, 10, 16, 0)).quote(booking(MOVED_AT));

		assertEquals(CancellationWindow.FREE, quote.window());
		assertEquals(4500L, quote.refundMinor());
		assertEquals(RefundReason.VENUE_CHANGE, quote.reason());
		assertEquals(tirane(9, 11, 15, 0), quote.freeExitUntil());
	}
}
