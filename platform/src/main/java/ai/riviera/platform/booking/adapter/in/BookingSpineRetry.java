package ai.riviera.platform.booking.adapter.in;

import java.time.Clock;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.env.Environment;
import org.springframework.modulith.events.IncompleteEventPublications;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import ai.riviera.platform.shared.FailedPublicationRetry;

/**
 * Re-drives this module's failed payment → booking publications on a schedule (#1340). Both handlers are
 * guarded transitions, so a redelivery is a no-op (invariants #2, #8); the refund-bulkhead listeners stay on
 * the admin lever, which may re-ask the gateway.
 * {@code riviera.events.spine-retry.enabled=false} halts it; an IT that leaves a spine row FAILED past
 * {@code min-age} must set it, and the initial delay backstops a forgotten opt-out.
 */
@Component
@ConditionalOnProperty(name = "riviera.events.spine-retry.enabled", havingValue = "true", matchIfMissing = true)
class BookingSpineRetry {

	/** The explicit ids of this module's listeners whose redelivery is a no-op (ListenerIdSnapshotTest). */
	static final Set<String> LISTENER_IDS = Set.of(
			"booking.confirm-on-payment-confirmed",
			"booking.release-on-payment-canceled");

	private static final Logger log = LoggerFactory.getLogger(BookingSpineRetry.class);

	private final FailedPublicationRetry retry;

	BookingSpineRetry(IncompleteEventPublications publications, Environment environment, Clock clock) {
		this.retry = new FailedPublicationRetry(publications, FailedPublicationRetry.Bounds.from(environment),
				LISTENER_IDS, clock);
	}

	@Scheduled(fixedDelayString = "${riviera.events.spine-retry.interval:PT10M}",
			initialDelayString = "${riviera.events.spine-retry.initial-delay:PT30M}")
	void sweep() {
		int resubmitted = retry.resubmit();
		if (resubmitted > 0) {
			log.info("Resubmitted {} failed booking spine publication(s)", resubmitted);
		}
	}
}
