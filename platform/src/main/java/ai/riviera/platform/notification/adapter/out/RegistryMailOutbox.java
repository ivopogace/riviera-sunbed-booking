package ai.riviera.platform.notification.adapter.out;

import java.util.concurrent.atomic.AtomicInteger;

import org.springframework.modulith.events.EventPublication;
import org.springframework.modulith.events.IncompleteEventPublications;
import org.springframework.modulith.events.core.EventPublicationRegistry;
import org.springframework.modulith.events.core.TargetEventPublication;
import org.springframework.stereotype.Component;

import ai.riviera.platform.notification.application.MailOutbox;

/**
 * The {@link MailOutbox} over the Event Publication Registry, scoped by listener-id prefix, never by
 * event type: {@code BookingConfirmed} also owes {@code payout} an accrual (invariant #9), so an event
 * filter would replay money-path work. Uses the {@code Predicate} overload, as {@code ResubmissionOptions}
 * reaches only {@code FAILED} rows, never a shed send. Once-only re-drive is the v2 registry's
 * {@code markResubmitted} claim, so the count returned is a match count. A publication that is not a
 * {@link TargetEventPublication} is unattributable and excluded (fail closed).
 */
@Component
class RegistryMailOutbox implements MailOutbox {

	/**
	 * Prefix of every listener id this module owns. The registry matches {@code listener_id} (the
	 * listener's FQCN) string-equal, so renaming or moving a listener orphans outstanding rows unless a
	 * migration rewrites them.
	 */
	static final String NOTIFICATION_LISTENER_PREFIX = "ai.riviera.platform.notification.";

	private final EventPublicationRegistry registry;

	private final IncompleteEventPublications resubmissions;

	RegistryMailOutbox(EventPublicationRegistry registry, IncompleteEventPublications resubmissions) {
		this.registry = registry;
		this.resubmissions = resubmissions;
	}

	@Override
	public int countOutstanding() {
		return (int) registry.findIncompletePublications().stream()
				.filter(RegistryMailOutbox::isMailPublication)
				.count();
	}

	@Override
	public int resubmitOutstanding() {
		AtomicInteger matched = new AtomicInteger();
		resubmissions.resubmitIncompletePublications(publication -> {
			boolean inScope = isMailPublication(publication);
			if (inScope) {
				matched.incrementAndGet();
			}
			return inScope;
		});
		return matched.get();
	}

	/**
	 * Whether a publication targets a listener in this module. The re-drive counts inside this predicate
	 * because the resubmission API returns {@code void}; the registry applies it once per candidate.
	 */
	static boolean isMailPublication(EventPublication publication) {
		return publication instanceof TargetEventPublication target
				&& target.getTargetIdentifier().getValue().startsWith(NOTIFICATION_LISTENER_PREFIX);
	}
}
