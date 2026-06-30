package ai.riviera.platform.booking.infrastructure.in;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.booking.api.BookingCancelled;
import ai.riviera.platform.booking.api.BookingId;
import ai.riviera.platform.payment.api.BookingRef;
import ai.riviera.platform.payment.api.Money;
import ai.riviera.platform.payment.api.RefundPort;
import ai.riviera.platform.payment.api.RefundResult;
import ai.riviera.platform.venue.api.SetId;
import ai.riviera.platform.venue.api.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Unit test of the after-commit refund listener (U6): it issues the refund through {@link RefundPort}
 * only when something is owed, and throws on a gateway failure so the registry retains the event for
 * retry (loud over silent for money). In the adapter's package; no Spring, no DB.
 */
class BookingRefundListenerTest {

	private record Call(long bookingId, long minor, String currency) {
	}

	private static BookingCancelled event(long bookingId, long refundMinor, String currency) {
		return new BookingCancelled(new BookingId(bookingId), new VenueId(1L), new SetId(2L),
				LocalDate.of(2030, 7, 1), refundMinor, currency,
				ai.riviera.platform.booking.api.RefundReason.POLICY);
	}

	@Test
	void refundsWhenAmountIsPositive() {
		List<Call> calls = new ArrayList<>();
		RefundPort port = (booking, amount) -> {
			calls.add(new Call(booking.value(), amount.minor(), amount.currency()));
			return new RefundResult.Refunded("re_ok");
		};

		new BookingRefundListener(port).on(event(42L, 2250L, "EUR"));

		assertEquals(List.of(new Call(42L, 2250L, "EUR")), calls,
				"the refund is issued for the server-computed amount + currency");
	}

	@Test
	void skipsWhenNothingIsOwed() {
		List<Call> calls = new ArrayList<>();
		RefundPort port = (booking, amount) -> {
			calls.add(new Call(booking.value(), amount.minor(), amount.currency()));
			return new RefundResult.Refunded("re_unexpected");
		};

		new BookingRefundListener(port).on(event(42L, 0L, "EUR"));

		assertTrue(calls.isEmpty(), "a non-refundable cancellation issues no refund (ADR-0005)");
	}

	@Test
	void throwsOnGatewayFailureSoTheRegistryRetries() {
		RefundPort port = (booking, amount) -> new RefundResult.Failed("card_error");

		assertThrows(IllegalStateException.class,
				() -> new BookingRefundListener(port).on(event(42L, 2250L, "EUR")),
				"a failed refund throws so the publication is retained and re-submitted");
	}
}
