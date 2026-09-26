package ai.riviera.platform.notification.application;

/**
 * What the Event Publication Registry still owes this module's listeners, and the lever to re-drive
 * it; implemented in {@code adapter/out}. Scoped by construction: the registry also holds
 * {@code payout}'s ledger accruals (invariant #9) and {@code booking}'s Stripe refunds, so never add a
 * scope argument a caller could widen. Not a delivery guarantee: a re-driven publication that fails
 * again stays outstanding, and {@code riviera.outbox.pending} stays the signal. Rationale:
 * {@code RESPONSIBILITIES.md} §notification.
 */
public interface MailOutbox {

	/**
	 * How many of this module's publications are still outstanding. Under
	 * {@code completion-mode=archive} a completed publication leaves the live table, so a completed
	 * mail is never counted here.
	 */
	int countOutstanding();

	/**
	 * Hands every outstanding in-scope publication back to the registry, returning the match count:
	 * an upper bound on what was re-driven, since the registry's {@code markResubmitted} claim skips
	 * one still in flight and its resubmission API returns {@code void}.
	 */
	int resubmitOutstanding();
}
