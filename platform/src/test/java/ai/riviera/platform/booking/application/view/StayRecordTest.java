package ai.riviera.platform.booking.application.view;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

class StayRecordTest {

	private static final String CODE = "ABCD234567";
	private static final VenueId VENUE = new VenueId(1L);
	private static final LocalDate DAY = LocalDate.of(2026, 8, 3);

	@Test
	void theSummaryNeverCarriesNothingLeftEvenWhenEveryStretchIsRefundedAway() {
		StayRecord stay = new StayRecord(new StayId(4L), CODE, VENUE, DAY, DAY.plusDays(3),
				List.of(refundedAway(1L, DAY), refundedAway(2L, DAY.plusDays(2))));

		BookingRecord summary = stay.asBooking();

		assertFalse(summary.everyDayRefunded(), "a stay's nothing left is LiveRemainder's, never the fold's");
		assertEquals(18000L, summary.dayRefundedMinor(), "the day refunds still sum");
	}

	private static BookingRecord refundedAway(long id, LocalDate firstDay) {
		return new BookingRecord(id, CODE, BookingStatus.CONFIRMED, VENUE, new SetId(id), new CustomerId(7L), firstDay,
				firstDay.plusDays(1), 9000L, "EUR", null, null, null, null, Instant.EPOCH, null, null, null, 9000L, true);
	}
}
