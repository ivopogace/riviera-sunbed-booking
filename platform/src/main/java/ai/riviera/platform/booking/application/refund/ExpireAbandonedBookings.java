package ai.riviera.platform.booking.application.refund;

import java.time.Duration;

import ai.riviera.platform.booking.application.request.RequestWindows;

/**
 * The abandoned-payment TTL sweep use case: expire bookings that have lingered in
 * {@code AWAITING_PAYMENT} longer than {@code ttl} and free their held {@code (set, date)}. Driven
 * by a scheduled adapter (the codebase's first scheduler); the {@code ttl} is passed in so the
 * application layer holds no configuration type. Idempotent and safe to run repeatedly/concurrently
 * — the guarded transition behind {@link ReleaseAbandonedBooking} is the concurrency primitive.
 */
public interface ExpireAbandonedBookings {

	/**
	 * Voids and releases each {@code AWAITING_PAYMENT} booking {@code ttl} after creation or, once
	 * accepted, a pay window after acceptance (whole {@code windows}: the payment-due mail's instant),
	 * and any whose service day ended (invariant #4); returns the count. A paid one is the webhook's (#8).
	 */
	int sweep(Duration ttl, RequestWindows windows);
}
