package ai.riviera.platform.booking.infrastructure.in;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.application.in.ExpireAbandonedBookings;
import ai.riviera.platform.booking.infrastructure.AbandonedPaymentProperties;

/**
 * The codebase's first scheduler — a driving adapter that periodically runs the abandoned-payment
 * TTL sweep (issue #51), reusing the {@code booking} lifecycle's cancel+release orchestration via
 * {@link ExpireAbandonedBookings}. {@code @Profile("stripe")} (with {@code @EnableScheduling} on
 * {@code BookingSchedulingConfig}): under the default stub profile bookings confirm synchronously, so
 * there is nothing to sweep and the scheduler is absent.
 *
 * <p>{@code fixedDelay} (not {@code fixedRate}): each run starts only after the previous one finished,
 * so a slow sweep never overlaps itself on this instance. Multi-instance safety needs no distributed
 * lock — the guarded {@code UPDATE … WHERE status='AWAITING_PAYMENT' … RETURNING} behind the sweep
 * lets at most one runner transition a given booking (invariant #2). The interval and TTL are
 * configurable ({@code booking.awaiting-payment.*}); the TTL is passed into the use case so the
 * application layer holds no configuration type. Package-private (invariant #11).
 */
@Component
@Profile("stripe")
class AbandonedBookingScheduler {

	private static final Logger log = LoggerFactory.getLogger(AbandonedBookingScheduler.class);

	private final ExpireAbandonedBookings expireAbandonedBookings;
	private final AbandonedPaymentProperties properties;

	AbandonedBookingScheduler(ExpireAbandonedBookings expireAbandonedBookings,
			AbandonedPaymentProperties properties) {
		this.expireAbandonedBookings = expireAbandonedBookings;
		this.properties = properties;
	}

	@Scheduled(fixedDelayString = "${booking.awaiting-payment.sweep-interval}",
			initialDelayString = "${booking.awaiting-payment.initial-delay}")
	void sweep() {
		int expired = expireAbandonedBookings.sweep(properties.ttl());
		if (expired > 0) {
			log.info("abandoned-payment sweep expired {} booking(s)", expired);
		}
	}
}
