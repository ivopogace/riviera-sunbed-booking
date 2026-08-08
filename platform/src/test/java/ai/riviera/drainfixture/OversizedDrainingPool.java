package ai.riviera.drainfixture;

import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * A deliberately oversized draining pool, in the fixture tree so the detector's positive case is
 * proven without mis-shaping production code (the {@code ai.riviera.*fixture} mechanism).
 *
 * <p>It exists to make {@code ShutdownDrainArchitectureTest}'s scan <strong>falsifiable</strong>: a
 * detector that silently found nothing — because ArchUnit failed to resolve the call target, or
 * because the marker method was renamed upstream — would satisfy every rule built on it trivially
 * and stay green forever. That is the failure mode the guard this fixture serves exists to replace,
 * so reproducing it here is not ceremony.
 *
 * <p>The 10-minute window is absurd on purpose: it is longer than any plausible SIGTERM grace, so a
 * reader cannot mistake this for a pool anyone should copy.
 */
public final class OversizedDrainingPool {

	private static final int ABSURD_DRAIN_MS = 600_000;

	private OversizedDrainingPool() {
	}

	public static ThreadPoolTaskExecutor pool() {
		ThreadPoolTaskExecutor pool = new ThreadPoolTaskExecutor();
		pool.setWaitForTasksToCompleteOnShutdown(true);
		pool.setAwaitTerminationMillis(ABSURD_DRAIN_MS);
		return pool;
	}

	/**
	 * A <strong>second</strong> draining pool in the same class — the case a per-class key cannot see, and
	 * the reason {@code ShutdownDrainArchitectureTest} counts windows as well as classes (review finding
	 * F-1). One class, two shares of the grace: keyed by class this collapses to a single entry with a
	 * single claim, so the sum reads correct while the real drain is double.
	 */
	public static ThreadPoolTaskExecutor secondPoolInTheSameClass() {
		ThreadPoolTaskExecutor pool = new ThreadPoolTaskExecutor();
		pool.setWaitForTasksToCompleteOnShutdown(true);
		pool.setAwaitTerminationMillis(ABSURD_DRAIN_MS);
		return pool;
	}
}
