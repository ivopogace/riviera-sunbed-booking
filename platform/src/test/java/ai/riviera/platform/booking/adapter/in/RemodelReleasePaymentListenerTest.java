package ai.riviera.platform.booking.adapter.in;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import ai.riviera.platform.booking.application.remodel.RemodelReceipts;
import ai.riviera.platform.booking.events.BookingCancelled;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.payment.api.CancelPaymentPort;
import ai.riviera.platform.payment.vocabulary.PaymentCancellation;
import ai.riviera.platform.shared.ObservabilityMetrics;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Unit test of the after-commit intent void: a remodel that releases an unpaid claim leaves its
 * PaymentIntent open, so this listener cancels it — and only for a booking the receipt records as released. A
 * transient gateway failure throws so the registry retains the publication, and the one loss it
 * cannot undo — the guest paid first — is counted where an alert can see it. In the adapter's
 * package; no Spring, no DB.
 */
class RemodelReleasePaymentListenerTest {

	private final List<Long> cancelled = new ArrayList<>();

	private final MeterRegistry meters = new SimpleMeterRegistry();

	/**
	 * The bookings the receipt answers as released; every other id was refunded, declined or never remodelled. 43 and 44
	 * are in it so only the reason check keeps their policy and weather cancels from a void.
	 */
	private final Set<Long> released = Set.of(42L, 43L, 44L, 46L, 47L, 48L, 49L, 50L, 51L);

	private static BookingCancelled event(long bookingId, long refundMinor, RefundReason reason) {
		return new BookingCancelled(new BookingId(bookingId), new VenueId(1L), new SetId(2L),
				LocalDate.of(2030, 7, 1), refundMinor, "EUR", reason);
	}

	private RemodelReleasePaymentListener listenerAnswering(PaymentCancellation answer) {
		CancelPaymentPort port = booking -> {
			cancelled.add(booking.value());
			return answer;
		};
		RemodelReceipts receipts = mock(RemodelReceipts.class);
		when(receipts.releasedByRemodel(any())).thenAnswer(call -> released.contains(call.<BookingId>getArgument(0).value()));
		return new RemodelReleasePaymentListener(port, receipts, meters);
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

	/**
	 * A paid stay whose every day the venue or the weather had refunded ends in a remodel refund of the nothing
	 * left (#1291): the same {@code VENUE_CHANGE}, zero-refund shape as a release, but it collected and was repaid.
	 */
	@Test
	void leavesAPaidBookingRefundedToNothingAlone() {
		listenerAnswering(new PaymentCancellation.NotCancellable("succeeded"))
				.on(event(52L, 0L, RefundReason.VENUE_CHANGE));

		assertTrue(cancelled.isEmpty(), "a refunded booking's succeeded payment is not voided");
		assertEquals(0.0, collectedCount(), "nobody is owed a refund by hand");
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

	/**
	 * The guest paid between the commit and this call, so they hold a payment for a booking that no
	 * longer exists. Nothing retries it and no lever reaches it, so the counter is the only signal an
	 * alert can watch — a log line alone would leave the debt invisible.
	 */
	@Test
	void countsTheReleasedBookingThatHadAlreadyCollected() {
		listenerAnswering(new PaymentCancellation.NotCancellable("succeeded"))
				.on(event(49L, 0L, RefundReason.VENUE_CHANGE));

		assertEquals(1.0, collectedCount(), "the guest is owed a refund by hand and nothing else records it");
	}

	@Test
	void countsNothingWhenTheIntentWasVoidedOrWasNeverThere() {
		listenerAnswering(new PaymentCancellation.Canceled()).on(event(50L, 0L, RefundReason.VENUE_CHANGE));
		listenerAnswering(new PaymentCancellation.NoCollection()).on(event(51L, 0L, RefundReason.VENUE_CHANGE));

		assertEquals(0.0, collectedCount(), "nobody is owed anything when the intent never collected");
	}

	private double collectedCount() {
		return meters.counter(ObservabilityMetrics.REMODEL_RELEASE_COLLECTED).count();
	}
}
