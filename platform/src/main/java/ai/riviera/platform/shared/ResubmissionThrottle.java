package ai.riviera.platform.shared;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.IntSupplier;

/**
 * The once-only guard behind an admin outbox-resubmit lever: single-flight, plus a cooldown that
 * starts at construction. Each module's lever (the mail outbox, the refund outbox) supplies its
 * own scope and its own window; this class owns what a press <em>means</em> — it either does real
 * work or says plainly why it did not.
 *
 * <p><strong>Kernel admission (#454) — ownership, not reuse.</strong> What this guard throttles is a
 * sweep of the platform's one Event Publication Registry, and what it races is the registry's
 * <em>boot republication</em> ({@code republish-outstanding-events-on-restart=true}, fired once at
 * context refresh from the composition root's configuration). Neither is any bounded context's to
 * own — and once a second module hosted a lever (#454), no module-owned home was available to it
 * without one lever's module depending on the other's internals. The same shape as
 * {@link MdcTaskDecorator}: the mechanism's other half lives at the root that modules must not
 * depend on. (#454's plan first decided the opposite — two per-module copies — and the second copy
 * immediately failed the merge bar's duplication gate, the #410 → #455 lesson one more time.)
 *
 * <p><strong>Duplicate work is prevented one layer down, and this is not that layer.</strong> The v2
 * registry's {@code markResubmitted} claim ({@code UPDATE … WHERE ID = ? AND STATUS !=
 * 'RESUBMITTED'}) skips a publication whose previous resubmission is still in flight — durably,
 * across instances — and the refund lever's gateway refuses to create a refund it already holds
 * besides. What this
 * class bounds is redundant <em>sweeps</em>: during an outage every re-driven attempt fails fast and
 * is immediately eligible again, so an unthrottled button drives a retry storm at the dependency
 * that is already struggling, each press reporting success while moving nothing. The
 * {@link ReentrantLock#tryLock()} answers the simultaneous case (two admins, or one double-click on
 * two request threads); the window answers the rapid-sequential one.
 *
 * <p><strong>The window starts at construction, not at the first press.</strong> A deploy has just
 * republished everything outstanding, so a press seconds later is the same redundant sweep as any
 * other rapid second one. Treating the boot republish as sweep zero costs at most one refused press
 * per deploy (#405's R-3).
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
	 * Runs one guarded sweep, or refuses with the reason.
	 *
	 * <p>The cooldown is stamped <em>before</em> the sweep runs — the conservative order: a sweep that
	 * throws part-way has still re-driven some publications, so the window has to be running before
	 * the failure can be observed, or a partially-completed sweep is immediately repeatable.
	 *
	 * @param sweep the caller's scope re-drive, returning how many publications it handed back
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
