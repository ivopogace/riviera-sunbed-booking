package ai.riviera.platform.customer.adapter.in;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import ai.riviera.platform.customer.application.ExpireGuestContacts;

/**
 * Periodically runs the guest-contact retention sweep (#101 Slice 2) — the {@code customer} module's own
 * driving adapter, sibling of {@code booking}'s {@code RequestSweepScheduler} / {@code
 * AbandonedBookingScheduler}.
 *
 * <p><strong>Gated on {@code customer.retention.enabled}, and therefore absent by default.</strong> That
 * condition does double duty. It is the ops safety switch: retention erasure is irreversible (a tombstone
 * has no undo), so nothing may sweep until the window has been set per counsel and ops deliberately opts in
 * (R-2/R-6). And it keeps the bean out of every default-profile test context — {@code @EnableScheduling} is
 * global in this application, so an unconditional {@code @Scheduled} would fire during the full suite and
 * could perturb the booking sweeps' timing windows (the #98/#122 lesson, R-3). A bean that does not exist
 * cannot fire. Pinned by {@code GuestContactRetentionSchedulerConfigTest}.
 *
 * <p>{@code fixedDelay} so runs never overlap on this instance; multi-instance safety needs no distributed
 * lock — every scrub is a guarded {@code UPDATE … WHERE id = :id AND erased_at IS NULL}, so at most one
 * runner can tombstone a given row and a concurrent run is a no-op. Lockless-on-one-instance is the
 * documented deployment posture (improvement-plan D1/D3). The default cadence is deliberately slack: a
 * retention window is measured in years, so nothing is gained by sweeping often, and {@code initial-delay}
 * keeps it off the startup hot path.
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
