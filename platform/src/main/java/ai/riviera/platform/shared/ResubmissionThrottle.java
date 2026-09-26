package ai.riviera.platform.shared;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.IntSupplier;

/**
 * The once-only guard behind an admin outbox-resubmit lever: single-flight ({@link ReentrantLock#tryLock()})
 * plus a cooldown that starts at construction, since a deploy has just republished everything outstanding
 * (the boot republish is sweep zero). Each lever module supplies its own scope and window. It bounds
 * redundant <em>sweeps</em> — a retry storm at a struggling dependency — while duplicate re-delivery is
 * prevented one layer down by the registry's {@code markResubmitted} claim. Admission (ownership, not
 * reuse): RESPONSIBILITIES.md §shared.
 */
public final class ResubmissionThrottle {

	private final Duration cooldown;

	private final Clock clock;

	private final ReentrantLock inFlight = new ReentrantLock();

	private volatile Instant lastAcceptedAt;

	public ResubmissionThrottle(Duration cooldown, Clock clock) {
		this.cooldown = cooldown;
		this.clock = clock;
		this.lastAcceptedAt = clock.instant();
	}

	/**
	 * Runs one guarded sweep ({@code sweep} returns how many publications it handed back), or refuses with the
	 * reason. The cooldown is stamped <em>before</em> the sweep, so one that throws part-way is not immediately
	 * repeatable.
	 */
	public ResubmissionOutcome attempt(IntSupplier sweep) {
		if (!inFlight.tryLock()) {
			return new ResubmissionOutcome.AlreadyRunning(cooldown);
		}
		try {
			Duration remaining = cooldownRemaining();
			if (!remaining.isZero()) {
				return new ResubmissionOutcome.CoolingDown(remaining);
			}
			lastAcceptedAt = clock.instant();
			return new ResubmissionOutcome.Resubmitted(sweep.getAsInt(), cooldown);
		}
		finally {
			inFlight.unlock();
		}
	}

	/** How long until an attempt would be accepted; {@link Duration#ZERO} when one would be now. */
	public Duration cooldownRemaining() {
		Duration remaining = cooldown.minus(Duration.between(lastAcceptedAt, clock.instant()));
		return remaining.isNegative() ? Duration.ZERO : remaining;
	}
}
