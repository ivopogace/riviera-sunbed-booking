package ai.riviera.platform.notification.application;

import java.time.Instant;

/**
 * The do-not-mail list: {@link TransactionalMailService} skips every send to a suppressed address, on
 * both vehicles. Entries are never deleted — {@link #reinstate} flags a row, it does not remove it.
 * Callers pass raw addresses; the adapter normalizes and stores only a peppered HMAC plus the domain,
 * and the entry survives erasure (ADR-0012). Timestamps are UTC instants (invariant #6).
 */
public interface EmailSuppressions {

	/** Whether this address is on the do-not-mail list. */
	boolean isSuppressed(String email);

	/**
	 * Upsert of an event at {@code at}, keeping {@code first_suppressed_at}; an event no newer than the row's
	 * last event or reinstatement moves nothing (feeds are unordered). A non-{@code local@domain} value throws
	 * {@link IllegalArgumentException}. A writer arms the withheld-flag probe: RESPONSIBILITIES.md §notification.
	 */
	void suppress(String email, SuppressionReason reason, Instant at);

	/**
	 * Admin-only lift: sets {@code reinstated_at}, never deletes, never an erasure side effect. Idempotent,
	 * and does not validate shape — junk input answers {@link ReinstateOutcome.NotSuppressed}.
	 */
	ReinstateOutcome reinstate(String email, Instant at);
}
