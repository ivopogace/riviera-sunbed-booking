package ai.riviera.platform.shared;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.core.env.Environment;
import org.springframework.modulith.events.EventPublication;
import org.springframework.modulith.events.IncompleteEventPublications;
import org.springframework.modulith.events.core.TargetEventPublication;

/**
 * One bounded, scheduled re-drive of a module's own {@code FAILED} registry publications, for listeners
 * whose redelivery is a no-op (#1340). The module passes an exact-id allowlist; the bounds are the
 * platform's, since every module's retries land on the same executor. Uses the {@code Predicate}
 * overload: {@code ResubmissionOptions} reads a batch of all failed rows before filtering. The listener id is
 * only on Modulith's core {@link TargetEventPublication}, as for the outbox levers; {@code PayoutSpineRetryIT}
 * fails if an upgrade stops handing it out. Rationale: {@code RESPONSIBILITIES.md} §{@code shared}.
 */
public final class FailedPublicationRetry {

	private final IncompleteEventPublications publications;

	private final Bounds bounds;

	private final Set<String> listenerIds;

	private final Clock clock;

	public FailedPublicationRetry(IncompleteEventPublications publications, Bounds bounds, Set<String> listenerIds,
			Clock clock) {
		this.publications = publications;
		this.bounds = bounds;
		this.listenerIds = Set.copyOf(listenerIds);
		this.clock = clock;
	}

	/** Hands back at most {@code batchSize} eligible publications and returns how many. */
	public int resubmit() {
		Instant cutoff = clock.instant().minus(bounds.minAge());
		AtomicInteger accepted = new AtomicInteger();
		publications.resubmitIncompletePublications(publication -> {
			if (accepted.get() >= bounds.batchSize() || !isEligible(publication, cutoff)) {
				return false;
			}
			accepted.incrementAndGet();
			return true;
		});
		return accepted.get();
	}

	/**
	 * Failed, targeted at an allowlisted listener, under the attempt cap, and untouched since {@code cutoff}.
	 * A publication that is not a {@link TargetEventPublication} cannot name its listener and is excluded.
	 */
	boolean isEligible(EventPublication publication, Instant cutoff) {
		return publication instanceof TargetEventPublication target
				&& listenerIds.contains(target.getTargetIdentifier().getValue())
				&& publication.getStatus() == EventPublication.Status.FAILED
				&& publication.getCompletionAttempts() < bounds.maxAttempts()
				&& lastTouched(publication).isBefore(cutoff);
	}

	private static Instant lastTouched(EventPublication publication) {
		Instant resubmitted = publication.getLastResubmissionDate();
		return resubmitted != null ? resubmitted : publication.getPublicationDate();
	}

	/**
	 * {@code riviera.events.spine-retry.*}: rows per sweep, the quiet period after a publication's last
	 * attempt, and the attempt count past which a row waits for a restart or an operator.
	 */
	public record Bounds(@DefaultValue("50") int batchSize, @DefaultValue("PT5M") Duration minAge,
			@DefaultValue("5") int maxAttempts) {

		private static final String PREFIX = "riviera.events.spine-retry";

		/** Binds from the environment, not as a bean: a module test bootstraps no {@code shared} bean. */
		public static Bounds from(Environment environment) {
			return Binder.get(environment).bindOrCreate(PREFIX, Bounds.class);
		}

		public Bounds {
			if (batchSize < 1 || maxAttempts < 1 || minAge.isNegative()) {
				throw new IllegalArgumentException("riviera.events.spine-retry needs batch-size >= 1, "
						+ "max-attempts >= 1 and a non-negative min-age, but was " + batchSize + ", "
						+ maxAttempts + ", " + minAge);
			}
		}
	}
}
