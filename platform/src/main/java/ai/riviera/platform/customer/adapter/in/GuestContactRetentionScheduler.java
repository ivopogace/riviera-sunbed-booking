package ai.riviera.platform.customer.adapter.in;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import ai.riviera.platform.customer.application.ExpireGuestContacts;

/**
 * Periodically runs the guest-contact retention sweep (knobs: {@code docs/runbooks/data-erasure.md}).
 *
 * <p><strong>Absent unless {@code customer.retention.enabled=true}</strong>; keep it so: erasure is
 * irreversible, so nothing sweeps until counsel sets the window and ops opts in; and
 * {@code @EnableScheduling} is global, so an unconditional bean would fire in the test suite (pinned by
 * {@code GuestContactRetentionSchedulerConfigTest}). {@code fixedDelay} never overlaps on one instance;
 * across instances no lock is needed, since every scrub is guarded on {@code erased_at IS NULL}.
 */
@Component
@ConditionalOnProperty(name = "customer.retention.enabled", havingValue = "true")
class GuestContactRetentionScheduler {

	private final ExpireGuestContacts expireGuestContacts;

	GuestContactRetentionScheduler(ExpireGuestContacts expireGuestContacts) {
		this.expireGuestContacts = expireGuestContacts;
	}

	@Scheduled(fixedDelayString = "${customer.retention.sweep-interval:PT6H}",
			initialDelayString = "${customer.retention.initial-delay:PT5M}")
	void sweep() {
		expireGuestContacts.sweep();
	}
}
