package ai.riviera.platform.booking.adapter.out;

import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

import org.springframework.modulith.events.EventPublication;
import org.springframework.modulith.events.IncompleteEventPublications;
import org.springframework.modulith.events.core.EventPublicationRegistry;
import org.springframework.modulith.events.core.TargetEventPublication;
import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.application.refund.RefundOutbox;

/**
 * The {@link RefundOutbox} over the Event Publication Registry, scoped to an exact-id allowlist of the
 * two refund-bulkhead listeners: the {@code booking} package prefix would also replay
 * {@code PaymentEventListener}'s payment → confirm spine ({@code RESPONSIBILITIES.md} §booking). Uses the
 * {@code Predicate} resubmission overload because {@code ResubmissionOptions} misses a shed publication
 * (§notification); the registry's {@code markResubmitted} makes a re-drive once-only. Fail-closed: a
 * publication that is not a {@link TargetEventPublication} cannot name its listener and is excluded.
 */
@Component
class RegistryRefundOutbox implements RefundOutbox {

	/**
	 * The registry's id for {@code BookingRefundListener.on(BookingCancelled)}. #404 deliberately kept
	 * class, method and parameter type unchanged so this id is byte-identical to what every historical
	 * publication row carries (invariant #12: no Flyway rewrite owed).
	 */
	static final String REFUND_LISTENER_ID = "ai.riviera.platform.booking.adapter.in."
			+ "BookingRefundListener.on(ai.riviera.platform.booking.events.BookingCancelled)";

	/**
	 * The registry's id for {@code RemodelReleasePaymentListener.on(BookingCancelled)} — the void of a
	 * remodel-released booking's uncollected intent. No money moves when it runs, but none is collected
	 * either: an intent left un-voided stays chargeable to a guest whose booking no longer exists.
	 */
	static final String RELEASE_VOID_LISTENER_ID = "ai.riviera.platform.booking.adapter.in."
			+ "RemodelReleasePaymentListener.on(ai.riviera.platform.booking.events.BookingCancelled)";

	private static final Set<String> ALLOWED_LISTENER_IDS = Set.of(REFUND_LISTENER_ID, RELEASE_VOID_LISTENER_ID);

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
	 * Whether a publication is targeted at exactly one of the allowed listeners. Counting inside the
	 * predicate is the only seam the framework offers — its resubmission API returns {@code void} and
	 * applies the predicate once per candidate.
	 */
	static boolean isRefundPublication(EventPublication publication) {
		return publication instanceof TargetEventPublication target
				&& ALLOWED_LISTENER_IDS.contains(target.getTargetIdentifier().getValue());
	}
}
