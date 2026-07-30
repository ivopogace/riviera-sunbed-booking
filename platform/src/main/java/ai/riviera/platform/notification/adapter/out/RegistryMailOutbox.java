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
 * options object reads like the intended way to scope a resubmission, and it would silently miss the
 * case this lever exists for. It delegates to {@code processFailedPublications}, whose query is
 * {@code STATUS = 'FAILED' OR (STATUS IS NULL AND COMPLETION_DATE IS NULL)} — so it reaches a send
 * whose listener <em>threw</em>, but not one the bulkhead <em>shed</em>: a rejected send never runs, so
 * nothing marks it failed and it sits at {@code PUBLISHED} while its publication stays outstanding
 * (#383/#407, the durability that shed policy is built on). Its {@code maxInFlight} gate is the second
 * trap, counting {@code RESUBMITTED} rows that a never-completing send leaves behind forever. The
 * {@code Predicate} overload routes to {@code processIncompletePublications}, which reads
 * <em>incomplete</em> and therefore covers both.
 *
 * <p><strong>The registry, not this adapter, is what makes a re-drive once-only.</strong> This
 * deployment runs the v2 JDBC repository (V8 ships the v2 schema; {@code use-legacy-structure}
 * defaults to false), whose {@code markResubmitted} is a real claim —
 * {@code UPDATE … SET STATUS = 'RESUBMITTED' … WHERE ID = ? AND STATUS != 'RESUBMITTED'} — so a
 * publication whose previous resubmission is still in flight is skipped, durably and across
 * instances. Worth stating because #405 reports the opposite, having read the v1 repository, where
 * that method is an unoverridden {@code default} returning {@code true}. The count this adapter
 * returns is therefore a match count, not a claim count; {@link MailOutbox#resubmitOutstanding()}
 * says what that means for the caller.
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
	 * streams the incomplete collection through {@code filter}, then claims each match). What the
	 * resulting count means is on {@link MailOutbox#resubmitOutstanding()}.
	 */
	static boolean isMailPublication(EventPublication publication) {
		return publication instanceof TargetEventPublication target
				&& target.getTargetIdentifier().getValue().startsWith(NOTIFICATION_LISTENER_PREFIX);
	}
}
