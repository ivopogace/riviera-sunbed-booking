package ai.riviera.platform.booking.adapter.in;

import ai.riviera.platform.booking.application.request.RequestWindows;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.application.refund.ExpireAbandonedBookings;

/**
 * Driving adapter that periodically runs the abandoned-payment TTL sweep via
 * {@link ExpireAbandonedBookings}. {@code @Profile("stripe")}: under the stub profile bookings
 * confirm synchronously, so there is nothing to sweep. {@code fixedDelay}, so a slow run never
 * overlaps itself; multi-instance needs no lock, as the guarded {@code UPDATE … WHERE
 * status='AWAITING_PAYMENT' … RETURNING} lets one runner transition a booking (invariant #2).
 * Interval and TTL from {@code booking.awaiting-payment.*}; the TTL is passed into the use case.
 */
@Component
@Profile("stripe")
class AbandonedBookingScheduler {

	private static final Logger log = LoggerFactory.getLogger(AbandonedBookingScheduler.class);

	private final ExpireAbandonedBookings expireAbandonedBookings;
	private final AbandonedPaymentProperties properties;
	private final RequestWindows requestWindows;

	AbandonedBookingScheduler(ExpireAbandonedBookings expireAbandonedBookings,
			AbandonedPaymentProperties properties, RequestWindows requestWindows) {
		this.expireAbandonedBookings = expireAbandonedBookings;
		this.properties = properties;
		this.requestWindows = requestWindows;
	}

	@Scheduled(fixedDelayString = "${booking.awaiting-payment.sweep-interval:PT5M}",
			initialDelayString = "${booking.awaiting-payment.initial-delay:PT1M}")
	void sweep() {
		int expired = expireAbandonedBookings.sweep(properties.ttl(), requestWindows);
		if (expired > 0) {
			log.info("abandoned-payment sweep expired {} booking(s)", expired);
		}
	}
}
