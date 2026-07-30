package ai.riviera.platform.shared;

import java.util.Collection;

/**
 * The platform's SIGTERM→SIGKILL grace, and how the pools that drain on shutdown divide it (#456).
 *
 * <p><strong>Why the budget is platform-wide and cannot be stated in a module.</strong> Pools that
 * drain are separate beans — or, for the recovery dispatcher, not beans at all — and Spring's
 * {@code destroySingletons()} runs their {@code destroy()} methods <em>sequentially on one thread</em>,
 * so their windows <strong>add rather than overlap</strong>. #410 established that and encoded it inside
 * {@code notification} as a mail budget divided by a mail pool count. #404 then landed a third draining
 * pool in {@code booking}, which that arithmetic could not see and which invariant #11 rightly forbade
 * it from reaching. A budget enforced per-module while the resource it rations belongs to the whole
 * process is the defect this class closes: the grace is stated once, here, and each pool's claim
 * against it is declared beside it so the sum is checkable by something that can see them all.
 *
 * <p><strong>Why it is admitted to the Shared Kernel.</strong> This package's admission test is <em>no
 * business logic, no module-owned state, no dependency on a module that depends back</em>, and this
 * class meets all three — it is constants and two pure sums. But the package Javadoc is equally clear
 * that it "is not a home for code used in more than one place", so reuse is not the argument. The
 * argument is <strong>ownership</strong>: the SIGTERM grace is a property of the deployment platform,
 * and no bounded context owns it. {@code notification}'s Job is transactional-mail delivery and
 * {@code booking}'s is bookings; neither's remit covers "how long the process has to close", which is
 * exactly why the previous arrangement had {@code notification} stating a number that silently bound
 * {@code booking}. That is the same reasoning that admitted {@link ObservabilityMetrics}' metric
 * namespace, and it is narrower than "two modules need it" — a type that is merely reused still fails
 * it. As with that class, the {@code int} constants are inlined at compile time, so referencing one
 * creates no runtime dependency on this class.
 *
 * <p><strong>This class states the budget; the modules spend it.</strong> Each pool's
 * {@code @ConfigurationProperties} record still validates its own knob in its own compact constructor,
 * so a bad value still fails at boot in the module that owns it. Only the ceiling's <em>source</em>
 * lives here. Nothing enforces the sum at runtime — it is a compile-time-constant arrangement checked
 * by {@code ShutdownDrainArchitectureTest}, which also discovers the pools, so a fourth pool cannot
 * claim a share without a human adding it here.
 */
public final class ShutdownBudget {

	/**
	 * Render's documented default SIGTERM→SIGKILL window, and therefore everything the pools may spend
	 * between them. A drain outlasting it gets the process killed mid-close, so Hikari and the web layer
	 * never close in order — strictly worse than giving up, which is why every pool's expiry policy is
	 * "give up" rather than {@code shutdownNow()}.
	 *
	 * <p>This is the one line to correct if the platform or its grace changes. It is Render's documented
	 * default rather than a value measured against this service; the claims below were all sized against
	 * it before it had a name, so recording it changes no behaviour — it makes the assumption checkable.
	 */
	public static final int SIGTERM_GRACE_MS = 30_000;

	/**
	 * Each mail pool's share. Both {@code notification} pools — the registry executor and the recovery
	 * dispatcher — claim this separately, because they are destroyed separately; the pair is what #410's
	 * "20s across both" meant, restated as a per-pool claim so the platform can add it up.
	 */
	public static final int MAIL_POOL_CLAIM_MS = 10_000;

	/**
	 * {@code booking}'s refund bulkhead (#404), short on purpose: an abandoned refund is replayed from
	 * the Event Publication Registry at the next start under the idempotency key
	 * {@code booking-<id>-refund}, so the drain only needs to catch the sub-second common case. The
	 * pathological gateway round-trip is precisely the one it is safe to give up on.
	 */
	public static final int REFUND_POOL_CLAIM_MS = 5_000;

	private ShutdownBudget() {
	}

	/** What {@code claims} spend of the grace in total — they add, because the pools drain in sequence. */
	public static int claimed(Collection<Integer> claims) {
		return claims.stream().mapToInt(Integer::intValue).sum();
	}

	/**
	 * Whether every draining pool's claim fits inside {@link #SIGTERM_GRACE_MS} together. Takes the
	 * claims rather than reading the constants above so the rule that calls it can be shown to reject an
	 * oversized set — a check that consulted only its own constants would be satisfied by construction,
	 * which is exactly how the guard this replaces stayed green through a third pool landing.
	 */
	public static boolean fits(Collection<Integer> claims) {
		return claimed(claims) <= SIGTERM_GRACE_MS;
	}
}
