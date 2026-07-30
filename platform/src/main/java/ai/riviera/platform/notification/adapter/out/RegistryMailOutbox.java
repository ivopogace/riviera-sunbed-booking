package ai.riviera.platform.notification.adapter.out;

import java.util.concurrent.atomic.AtomicInteger;

import org.springframework.modulith.events.EventPublication;
import org.springframework.modulith.events.IncompleteEventPublications;
import org.springframework.modulith.events.core.EventPublicationRegistry;
import org.springframework.modulith.events.core.TargetEventPublication;
import org.springframework.stereotype.Component;

import ai.riviera.platform.notification.application.MailOutbox;

/**
 * The {@link MailOutbox} over Spring Modulith's Event Publication Registry (#405) — the driven adapter
 * that knows the registry exists, so nothing inside the hexagon has to.
 *
 * <p><strong>Scope is a listener-id prefix, and that is the load-bearing decision.</strong> The
 * registry's outstanding rows are shared: the same {@code BookingConfirmed} that owes this module a
 * confirmation mail also owes {@code payout} a ledger accrual (invariant #9), and a stuck
 * {@code BookingCancelled} owes the Stripe refund (invariant #8). Filtering on
 * {@link EventPublication#getEvent()} — all the published {@code events-api} offers — therefore cannot
 * separate them, and an admin pressing "resubmit mail" would replay money-path work. The instances the
 * registry hands the predicate are {@link TargetEventPublication}s carrying the listener id, so the
 * scope is stated where the difference actually lives: publications targeted at a listener under this
 * module's package. It also survives what a per-listener list would not — #373/#374's listeners are in
 * scope the day they land, without anyone remembering to add them.
 *
 * <p><strong>Why the {@code Predicate} overload and not {@code ResubmissionOptions}.</strong> 2.1's
 * options object reads like the intended way to scope a resubmission, and here it is a guaranteed
 * no-op: {@code resubmitIncompletePublications(ResubmissionOptions)} delegates to
 * {@code processFailedPublications}, which reads {@code findFailedPublications(…)} — a {@code default}
 * method returning an empty list that {@code JdbcEventPublicationRepository} does not override. It
 * would report success and send nothing. The {@code Predicate} overload routes to
 * {@code processIncompletePublications}, which reads the live table (#405 finding 3, sharpened).
 *
 * <p><strong>Fail-closed on an unattributable publication.</strong> If a publication is not a
 * {@link TargetEventPublication} it cannot be attributed to a module, and this scope excludes it. The
 * asymmetry is deliberate: excluding a mail costs a mail that waits for the next attempt; including an
 * unknown publication costs a replayed accrual or a second Stripe call.
 */
@Component
class RegistryMailOutbox implements MailOutbox {

	/**
	 * Every listener id this module owns starts here — Spring's default {@code listener_id} embeds the
	 * declaring class's FQCN, which V31 (#382) rewrote precisely because the registry matches it
	 * string-equal. {@code MailOutboxScopeTest} pins this against the confirmation listener's real id,
	 * and {@code RegistryMailBulkheadIT} pins that against what the running registry writes.
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
	 * Whether a publication belongs to this module's mail vehicle.
	 *
	 * <p>Counting inside the predicate rather than around the call is not a shortcut: the framework's
	 * resubmission API returns {@code void} and exposes no other seam, and the registry applies the
	 * predicate exactly once per candidate ({@code DefaultEventPublicationRegistry#processPublications}
	 * streams the incomplete collection through {@code filter}). What the count means, and how it
	 * degrades, is on {@link MailOutbox#resubmitOutstanding()}.
	 */
	static boolean isMailPublication(EventPublication publication) {
		return publication instanceof TargetEventPublication target
				&& target.getTargetIdentifier().getValue().startsWith(NOTIFICATION_LISTENER_PREFIX);
	}
}
