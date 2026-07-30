package ai.riviera.drainfixture;

import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * A deliberately oversized draining pool, in the fixture tree so the detector's positive case is
 * proven without mis-shaping production code (the {@code ai.riviera.*fixture} mechanism, #95).
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
}
