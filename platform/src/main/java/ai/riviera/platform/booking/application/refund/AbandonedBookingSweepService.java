package ai.riviera.platform.booking.application.refund;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import ai.riviera.platform.booking.api.BookingId;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.api.CancelPaymentPort;
import ai.riviera.platform.payment.vocabulary.PaymentCancellation;

/**
 * Expires abandoned {@code AWAITING_PAYMENT} bookings past their TTL and frees their sets (issue
 * #51), implementing {@link ExpireAbandonedBookings}. For each stale booking it:
 *
 * <ol>
 *   <li>cancels the Stripe PaymentIntent via {@link CancelPaymentPort} (collect-only — voids an
 *       uncollected intent, no money moves) so Stripe stops retrying and the payment can no longer
 *       succeed — the authoritative step done <strong>before</strong> any state change;</li>
 *   <li>only on a {@link PaymentCancellation.Canceled} outcome, runs the shared
 *       {@link ReleaseAbandonedBooking} (the same guarded transition + release the
 *       {@code payment_intent.canceled} webhook uses) — so the sweep and the webhook can never
 *       double-act.</li>
 * </ol>
 *
 * <p>A {@link PaymentCancellation.NotCancellable} (the payment already {@code succeeded}, or no
 * collection on record) leaves the booking untouched — the confirm webhook is the source of truth
 * for a successful payment (invariant #8). A {@link PaymentCancellation.Failed} (transient gateway
 * error) is skipped and retried on the next run. The Stripe call is outside any DB transaction (no
 * row lock held across the network round-trip); the transition + release are transactional inside
 * {@code ReleaseAbandonedBooking}. Package-private; only the {@code application.in} port is exposed
 * (invariant #11). Booking codes are never logged — ids only (invariant #7).
 */
@Service
class AbandonedBookingSweepService implements ExpireAbandonedBookings {

	private static final Logger log = LoggerFactory.getLogger(AbandonedBookingSweepService.class);

	private final Bookings bookings;
	private final CancelPaymentPort cancelPaymentPort;
	private final ReleaseAbandonedBooking releaseAbandonedBooking;
	private final Clock clock;

	AbandonedBookingSweepService(Bookings bookings, CancelPaymentPort cancelPaymentPort,
			ReleaseAbandonedBooking releaseAbandonedBooking, Clock clock) {
		this.bookings = bookings;
		this.cancelPaymentPort = cancelPaymentPort;
		this.releaseAbandonedBooking = releaseAbandonedBooking;
		this.clock = clock;
	}

	@Override
	public int sweep(Duration ttl) {
		Instant cutoff = clock.instant().minus(ttl);
		List<BookingId> stale = bookings.findExpirableAwaitingPayment(cutoff);
		int expired = 0;
		for (BookingId id : stale) {
			try {
				if (expire(id)) {
					expired++;
				}
			}
			catch (RuntimeException ex) {
				// Isolate each booking: a transient failure (e.g. a DataAccessException in the release
				// transaction) must not abort the whole batch and starve the bookings ordered after it
				// (the read is ORDER BY id). Logged with the cause and retried on the next run — the
				// guarded transition makes the retry safe.
				log.warn("sweep failed to expire booking {} — continuing, will retry next run",
						id.value(), ex);
			}
		}
		return expired;
	}

	/** Cancel the PaymentIntent then, only if authoritatively canceled, release the booking. */
	private boolean expire(BookingId id) {
		PaymentCancellation outcome = cancelPaymentPort.cancel(new BookingRef(id.value()));
		return switch (outcome) {
			case PaymentCancellation.Canceled ignored -> {
				boolean released = releaseAbandonedBooking.release(id);
				if (released) {
					log.info("expired abandoned booking {} and released its set (TTL sweep)", id.value());
				}
				yield released;
			}
			case PaymentCancellation.NotCancellable notCancellable -> {
				// Payment succeeded (confirm webhook wins, invariant #8) or no collection — leave it.
				log.info("sweep skipped booking {} — payment not cancellable ({})",
						id.value(), notCancellable.reason());
				yield false;
			}
			case PaymentCancellation.Failed failed -> {
				// Transient gateway error — retry on the next run.
				log.warn("sweep could not cancel payment for booking {} — retrying next run ({})",
						id.value(), failed.reason());
				yield false;
			}
		};
	}
}
