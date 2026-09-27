package ai.riviera.platform.booking.events;

import java.time.Instant;
import java.time.LocalDate;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.CancellationWindow;
import ai.riviera.platform.booking.vocabulary.DeclineReason;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** A request event's payload persisted before {@code lastDate} existed is a one-day request. */
class RequestEventsLastDayTest {

	private static final LocalDate FIRST = LocalDate.of(2026, 7, 3);
	private static final LocalDate LAST = LocalDate.of(2026, 7, 5);

	@Test
	void anOlderPayloadReadsAsOneDay() {
		assertEquals(FIRST, new BookingRequestDeclined(new BookingId(1), new SetId(2), FIRST, null, DeclineReason.VENUE)
				.lastDay());
		assertEquals(FIRST, new BookingRequestExpired(new BookingId(1), new SetId(2), FIRST, null).lastDay());
		assertEquals(FIRST, paymentDue(null).lastDay());
	}

	@Test
	void aStaysPayloadReadsItsLastDay() {
		assertEquals(LAST, new BookingRequestDeclined(new BookingId(1), new SetId(2), FIRST, LAST).lastDay());
		assertEquals(LAST, new BookingRequestExpired(new BookingId(1), new SetId(2), FIRST, LAST).lastDay());
		assertEquals(LAST, paymentDue(LAST).lastDay());
	}

	private static BookingPaymentDue paymentDue(LocalDate lastDate) {
		return new BookingPaymentDue(new BookingId(1), new VenueId(3), new SetId(2), FIRST, lastDate,
				Instant.parse("2026-07-02T18:00:00Z"), 13500L, "EUR", CancellationWindow.FREE, 0);
	}
}
