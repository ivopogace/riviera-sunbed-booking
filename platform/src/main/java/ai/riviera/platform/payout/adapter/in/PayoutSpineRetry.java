package ai.riviera.platform.payout.adapter.in;

import java.time.Clock;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.modulith.events.IncompleteEventPublications;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import ai.riviera.platform.shared.FailedPublicationRetry;

/**
 * Re-drives this module's failed ledger publications on a schedule (#1340). Every ledger write is
 * {@code INSERT … ON CONFLICT DO NOTHING}, so a redelivery is a no-op (invariant #9).
 * {@code riviera.events.spine-retry.enabled=false} is the IT isolation seam; the initial delay backstops it.
 */
@Component
@ConditionalOnProperty(name = "riviera.events.spine-retry.enabled", havingValue = "true", matchIfMissing = true)
@EnableConfigurationProperties(FailedPublicationRetry.Bounds.class)
class PayoutSpineRetry {

	/** The explicit ids of this module's listeners whose redelivery is a no-op (ListenerIdSnapshotTest). */
	static final Set<String> LISTENER_IDS = Set.of(
			"payout.accrue-on-booking-confirmed",
			"payout.reverse-on-booking-cancelled",
			"payout.reverse-day-on-booking-day-refunded");

	private static final Logger log = LoggerFactory.getLogger(PayoutSpineRetry.class);

	private final FailedPublicationRetry retry;

	PayoutSpineRetry(IncompleteEventPublications publications, FailedPublicationRetry.Bounds bounds, Clock clock) {
		this.retry = new FailedPublicationRetry(publications, bounds, LISTENER_IDS, clock);
	}

	@Scheduled(fixedDelayString = "${riviera.events.spine-retry.interval:PT10M}",
			initialDelayString = "${riviera.events.spine-retry.initial-delay:PT30M}")
	void sweep() {
		int resubmitted = retry.resubmit();
		if (resubmitted > 0) {
			log.info("Resubmitted {} failed payout spine publication(s)", resubmitted);
		}
	}
}
