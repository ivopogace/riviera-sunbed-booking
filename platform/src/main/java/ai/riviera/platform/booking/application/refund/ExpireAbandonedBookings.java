package ai.riviera.platform.booking.application.refund;

import java.time.Duration;

/**
 * The abandoned-payment TTL sweep use case (issue #51): expire bookings that have lingered in
 * {@code AWAITING_PAYMENT} longer than {@code ttl} and free their held {@code (set, date)}. Driven
 * by a scheduled adapter (the codebase's first scheduler); the {@code ttl} is passed in so the
 * application layer holds no configuration type. Idempotent and safe to run repeatedly/concurrently
 * — the guarded transition behind {@link ReleaseAbandonedBooking} is the concurrency primitive.
 */
public interface ExpireAbandonedBookings {

	/**
	 * Expire every {@code AWAITING_PAYMENT} booking created more than {@code ttl} ago: cancel its
	 * PaymentIntent (so Stripe stops retrying and the payment can no longer succeed), then cancel the
	 * booking and release its set. A booking whose payment already {@code succeeded} is left for the
	 * confirm webhook (invariant #8).
	 *
	 * <p>Two clocks (issue #98): an <em>instant</em> booking is abandoned {@code ttl} after
	 * creation (the guest was at the checkout screen); an <em>accepted request</em> is abandoned
	 * only {@code payWindow} after {@code accepted_at} — never on the creation clock, which may be
	 * hours older than the accept.
	 *
	 * @param ttl how long an instant booking may stay {@code AWAITING_PAYMENT} before it is considered abandoned
	 * @param payWindow how long an accepted request's guest has to pay, measured from accept
	 * @return the number of bookings actually expired this run (for logging/observability)
	 */
	int sweep(Duration ttl, Duration payWindow);
}
