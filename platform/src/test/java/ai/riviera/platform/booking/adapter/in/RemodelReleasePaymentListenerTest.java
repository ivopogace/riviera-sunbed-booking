package ai.riviera.platform.booking.adapter.in;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.booking.events.BookingCancelled;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.payment.api.CancelPaymentPort;
import ai.riviera.platform.payment.vocabulary.PaymentCancellation;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Unit test of the after-commit intent void: a remodel that releases an unpaid claim leaves its
 * PaymentIntent open, so this listener cancels it — and only for that one shape of cancellation. A
 * transient gateway failure throws so the registry retains the publication. In the adapter's
 * package; no Spring, no DB.
 */
class RemodelReleasePaymentListenerTest {

	private final List<Long> cancelled = new ArrayList<>();

	private static BookingCancelled event(long bookingId, long refundMinor, RefundReason reason) {
		return new BookingCancelled(new BookingId(bookingId), new VenueId(1L), new SetId(2L),
				LocalDate.of(2030, 7, 1), refundMinor, "EUR", reason);
	}

	private RemodelReleasePaymentListener listenerAnswering(PaymentCancellation answer) {
		CancelPaymentPort port = booking -> {
			cancelled.add(booking.value());
			return answer;
		};
		return new RemodelReleasePaymentListener(port);
	}

	@Test
	void voidsTheUncollectedIntentOfAReleasedClaim() {
		listenerAnswering(new PaymentCancellation.Canceled()).on(event(42L, 0L, RefundReason.VENUE_CHANGE));

		assertEquals(List.of(42L), cancelled, "the released booking's intent is voided");
	}

	@Test
	void leavesEveryOtherCancellationAlone() {
		RemodelReleasePaymentListener listener = listenerAnswering(new PaymentCancellation.Canceled());

		listener.on(event(43L, 0L, RefundReason.POLICY));
		listener.on(event(44L, 0L, RefundReason.WEATHER));
		listener.on(event(45L, 2000L, RefundReason.VENUE_CHANGE));

		assertTrue(cancelled.isEmpty(),
				"a policy or weather cancellation and a venue-caused refund all collected; only a release did not");
	}

	@Test
	void aTransientGatewayFailureThrowsSoThePublicationIsRetained() {
		RemodelReleasePaymentListener listener = listenerAnswering(new PaymentCancellation.Failed("timeout"));

		assertThrows(IllegalStateException.class, () -> listener.on(event(46L, 0L, RefundReason.VENUE_CHANGE)));
	}

	@Test
	void anAlreadySucceededOrAbsentPaymentCompletesThePublication() {
		assertDoesNotThrow(() -> listenerAnswering(new PaymentCancellation.NotCancellable("succeeded"))
				.on(event(47L, 0L, RefundReason.VENUE_CHANGE)));
		assertDoesNotThrow(() -> listenerAnswering(new PaymentCancellation.NoCollection())
				.on(event(48L, 0L, RefundReason.VENUE_CHANGE)));
	}
}
