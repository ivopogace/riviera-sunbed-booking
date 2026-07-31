package ai.riviera.platform.booking.adapter.out;

import java.util.concurrent.atomic.AtomicInteger;

import org.springframework.modulith.events.EventPublication;
import org.springframework.modulith.events.IncompleteEventPublications;
import org.springframework.modulith.events.core.EventPublicationRegistry;
import org.springframework.modulith.events.core.TargetEventPublication;
import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.application.refund.RefundOutbox;

/**
 * The {@link RefundOutbox} over Spring Modulith's Event Publication Registry (#454) — the driven
 * adapter that knows the registry exists, so nothing inside the hexagon has to.
 *
 * <p><strong>Scope is one exact listener id, and that is the load-bearing decision.</strong> #405's
 * {@code RegistryMailOutbox} scopes by module package prefix, which is safe there because every
 * listener in {@code notification} is a mail listener. This module also hosts
 * {@code PaymentEventListener} — the payment → confirm spine (invariant #8), whose cancel branch
 * releases availability (invariant #2) — so the {@code ai.riviera.platform.booking.} prefix would let
 * a button labelled "refund" replay payment-confirmation work. Exact equality deliberately loses the
 * "future listeners covered automatically" property: a second money-moving listener must be added to
 * this allowlist on purpose, with review. {@code RefundOutboxScopeTest} pins the constant against the
 * class-derived id and {@code RefundBulkheadIT} pins that against what the running registry writes
 * (#405's R-6, two levels).
 *
 * <p><strong>Why the {@code Predicate} overload and not {@code ResubmissionOptions}.</strong> The
 * options object delegates to a query reaching {@code STATUS = 'FAILED'} rows (plus legacy NULLs) — a
 * listener that <em>threw</em>. A refund the bulkhead <em>shed</em> (#404) never ran, so nothing
 * marked it failed and it sits at {@code PUBLISHED}; the {@code Predicate} overload routes to
 * {@code processIncompletePublications}, which reads <em>incomplete</em> and covers both. Same trap,
 * same answer as {@code RegistryMailOutbox} — restated because the shed row is one of the three cases
 * #454 exists to clear.
 *
 * <p><strong>The registry, not this adapter, is what makes a re-drive once-only</strong> — the v2
 * repository's {@code markResubmitted} claim ({@code UPDATE … WHERE ID = ? AND STATUS !=
 * 'RESUBMITTED'}) skips a publication whose previous resubmission is still in flight, durably and
 * across instances. The count returned is therefore a match count; {@link RefundOutbox} says what
 * that means for the caller.
 *
 * <p><strong>Fail-closed on an unattributable publication.</strong> One that is not a
 * {@link TargetEventPublication} cannot name its listener and is excluded: excluding a refund costs a
 * wait for the restart republish, while including an unknown publication could replay the payment
 * spine or a ledger accrual.
 */
@Component
class RegistryRefundOutbox implements RefundOutbox {

	/**
	 * The registry's id for {@code BookingRefundListener.on(BookingCancelled)} — the whole allowlist.
	 * #404 deliberately kept class, method and parameter type unchanged so this id is byte-identical to
	 * what every historical publication row carries (invariant #12: no Flyway rewrite owed).
	 */
	static final String REFUND_LISTENER_ID = "ai.riviera.platform.booking.adapter.in."
			+ "BookingRefundListener.on(ai.riviera.platform.booking.events.BookingCancelled)";

	private final EventPublicationRegistry registry;

	private final IncompleteEventPublications resubmissions;

	RegistryRefundOutbox(EventPublicationRegistry registry, IncompleteEventPublications resubmissions) {
		this.registry = registry;
		this.resubmissions = resubmissions;
	}

	@Override
	public int countOutstanding() {
		return (int) registry.findIncompletePublications().stream()
				.filter(RegistryRefundOutbox::isRefundPublication)
				.count();
	}

	@Override
	public int resubmitOutstanding() {
		AtomicInteger matched = new AtomicInteger();
		resubmissions.resubmitIncompletePublications(publication -> {
			boolean inScope = isRefundPublication(publication);
			if (inScope) {
				matched.incrementAndGet();
			}
			return inScope;
		});
		return matched.get();
	}

	/**
	 * Whether a publication is targeted at exactly the refund listener. Counting inside the predicate
	 * is the only seam the framework offers — its resubmission API returns {@code void} and applies the
	 * predicate once per candidate.
	 */
	static boolean isRefundPublication(EventPublication publication) {
		return publication instanceof TargetEventPublication target
				&& REFUND_LISTENER_ID.equals(target.getTargetIdentifier().getValue());
	}
}
