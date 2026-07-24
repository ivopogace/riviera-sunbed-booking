package ai.riviera.platform.booking.application.refund;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.payment.api.CancelPaymentPort;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.PaymentCancellation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Fast branch coverage for {@link AbandonedBookingSweepService} with in-memory doubles — no Spring,
 * no DB. Pins the per-outcome decision the sweep makes on each stale {@code AWAITING_PAYMENT}
 * booking's cancel result, in particular the #125 backstop: a {@link PaymentCancellation.NoCollection}
 * row (a {@code pay()} that threw after the reserve commit, leaving no payment on record) is now
 * <em>released</em> rather than skipped forever, while a {@link PaymentCancellation.NotCancellable}
 * ({@code succeeded}) is still left for the confirm webhook (invariant #8). The end-to-end real-DB
 * proof is {@code AbandonedBookingSweepIT}.
 */
class AbandonedBookingSweepServiceTest {

	private static final Clock CLOCK =
			Clock.fixed(Instant.parse("2026-11-01T09:00:00Z"), ZoneId.of("UTC"));
	private static final Duration TTL = Duration.ofMinutes(15);
	private static final Duration PAY_WINDOW = Duration.ofHours(12);
	private static final BookingId STALE = new BookingId(4242L);

	private final List<BookingId> released = new ArrayList<>();
	private final ReleaseAbandonedBooking recordingRelease = id -> {
		released.add(id);
		return true;
	};

	private AbandonedBookingSweepService sweepWith(PaymentCancellation cancelOutcome) {
		Bookings bookings = mock(Bookings.class);
		when(bookings.findExpirableAwaitingPayment(any(), any())).thenReturn(List.of(STALE));
		CancelPaymentPort cancel = booking -> cancelOutcome;
		return new AbandonedBookingSweepService(bookings, cancel, recordingRelease, CLOCK);
	}

	@Test
	void releasesAStaleBookingWithNoCollectionOnRecord() {
		// #125: no payment row (a pay() that threw after the reserve commit). Past the TTL this is a
		// stranded booking, so the sweep — the crash backstop — must release it, not skip it forever.
		int expired = sweepWith(new PaymentCancellation.NoCollection()).sweep(TTL, PAY_WINDOW);

		assertEquals(1, expired, "a stale no-collection booking is expired");
		assertEquals(List.of(STALE), released, "and its claim is released exactly once");
	}

	@Test
	void leavesASucceededBookingForTheWebhook() {
		// A succeeded payment is NotCancellable — the confirm webhook wins (invariant #8), never the sweep.
		int expired = sweepWith(new PaymentCancellation.NotCancellable("succeeded")).sweep(TTL, PAY_WINDOW);

		assertEquals(0, expired, "a succeeded booking is not expired by the sweep");
		assertTrue(released.isEmpty(), "and its claim is left held for the confirm webhook");
	}

	@Test
	void skipsATransientGatewayFailure() {
		// A transient Failed is retried next run — not released this round.
		int expired = sweepWith(new PaymentCancellation.Failed("lock_timeout")).sweep(TTL, PAY_WINDOW);

		assertEquals(0, expired, "a transient cancel failure is not expired this run");
		assertTrue(released.isEmpty(), "and nothing is released");
	}

	@Test
	void releasesAfterAnAuthoritativeCancel() {
		// Regression guard for the pre-#125 happy path: a Canceled PaymentIntent still releases the set.
		int expired = sweepWith(new PaymentCancellation.Canceled()).sweep(TTL, PAY_WINDOW);

		assertEquals(1, expired, "a canceled PaymentIntent expires the booking");
		assertEquals(List.of(STALE), released, "and releases its claim");
	}
}
