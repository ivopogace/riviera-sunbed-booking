package ai.riviera.platform.booking.adapter.in;

import ai.riviera.platform.booking.events.BookingDayRefunded;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.payment.api.RefundPort;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.Money;
import ai.riviera.platform.payment.vocabulary.RefundResult;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** The day-refund listener at its seam: the day's money goes through the port's day leg, once, or throws. */
class BookingDayRefundListenerTest {

	private static final LocalDate DAY = LocalDate.of(2030, 7, 8);

	private record Call(long bookingId, LocalDate day, long minor) {
	}

	private static BookingDayRefunded event(long refundMinor) {
		return new BookingDayRefunded(new BookingId(42L), new VenueId(1L), new SetId(2L), DAY, refundMinor, "EUR", null);
	}

	private static RefundPort dayRefunds(List<Call> calls, RefundResult answer) {
		return new RefundPort() {
			@Override
			public RefundResult refund(BookingRef booking, Money amount) {
				throw new UnsupportedOperationException("a day refund never refunds the whole share");
			}

			@Override
			public RefundResult refundDay(BookingRef booking, LocalDate serviceDate, Money amount) {
				calls.add(new Call(booking.value(), serviceDate, amount.minor()));
				return answer;
			}
		};
	}

	@Test
	void refundsTheDayThroughTheDayLeg() {
		List<Call> calls = new ArrayList<>();

		new BookingDayRefundListener(dayRefunds(calls, new RefundResult.Refunded("re_day"))).on(event(3000L));

		assertEquals(List.of(new Call(42L, DAY, 3000L)), calls, "the day's own rate, keyed by the day");
	}

	@Test
	void skipsAZeroRateDay() {
		List<Call> calls = new ArrayList<>();

		new BookingDayRefundListener(dayRefunds(calls, new RefundResult.Refunded("re_unexpected"))).on(event(0L));

		assertTrue(calls.isEmpty());
	}

	@Test
	void throwsOnGatewayFailureSoTheRegistryRetries() {
		RefundPort port = dayRefunds(new ArrayList<>(), new RefundResult.Failed("card_error"));

		assertThrows(IllegalStateException.class, () -> new BookingDayRefundListener(port).on(event(3000L)));
	}
}
