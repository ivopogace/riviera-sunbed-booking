package ai.riviera.platform.shared;

import java.util.Collection;

/**
 * The platform's SIGTERM→SIGKILL grace and each draining pool's claim on it. Spring destroys the pools
 * sequentially on one thread, so their drain windows <strong>add</strong>: a new draining pool must declare
 * its claim here or {@code ShutdownDrainArchitectureTest} fails. Each pool's properties record still
 * validates its own knob at boot; the {@code int} constants are compile-time inlined. Admission and
 * rationale: RESPONSIBILITIES.md §shared and docs/runbooks/observability.md.
 */
public final class ShutdownBudget {

	/**
	 * Render's documented default grace (assumed, not measured here) — everything the pools may spend between
	 * them. Outlasting it kills the process mid-close, which is why every pool's expiry policy gives up rather
	 * than {@code shutdownNow()}. The one line to change if the platform's grace changes.
	 */
	public static final int SIGTERM_GRACE_MS = 30_000;

	/**
	 * Each mail pool's share. Both {@code notification} pools — the registry executor and the recovery
	 * dispatcher — claim this separately, because they are destroyed separately; together they
	 * spend 20s, stated per pool so the platform can add it up.
	 */
	public static final int MAIL_POOL_CLAIM_MS = 10_000;

	/**
	 * {@code booking}'s refund bulkhead, short on purpose: an abandoned refund is replayed from the Event
	 * Publication Registry at next start under idempotency key {@code booking-<id>-refund}, so the drain only
	 * needs to catch the sub-second common case.
	 */
	public static final int REFUND_POOL_CLAIM_MS = 5_000;

	private ShutdownBudget() {
	}

	/** What {@code claims} spend of the grace in total — they add, because the pools drain in sequence. */
	public static int claimed(Collection<Integer> claims) {
		return claims.stream().mapToInt(Integer::intValue).sum();
	}

	/**
	 * Whether the claims together fit inside {@link #SIGTERM_GRACE_MS}. Takes the claims rather than reading
	 * the constants so the architecture test can show it rejects an oversized set.
	 */
	public static boolean fits(Collection<Integer> claims) {
		return claimed(claims) <= SIGTERM_GRACE_MS;
	}
}
