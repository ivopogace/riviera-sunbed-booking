package ai.riviera.platform.notification.application;

/**
 * What the Event Publication Registry still owes <em>this module</em>, and the lever to re-drive it
 * (#405) — a driven port, implemented by {@code adapter/out} against the registry.
 *
 * <p><strong>Scoped by construction.</strong> Both methods speak only of publications targeted at a
 * listener this module owns. That is not a convenience filter: the registry is shared infrastructure
 * whose outstanding rows also carry {@code payout}'s ledger accruals (invariant #9) and the refund
 * that calls Stripe (invariant #8), and the whole point of #405 is an admin lever that cannot reach
 * them. Naming the port after the module's own outbox — rather than after the registry — is what
 * keeps the scope from being an argument a caller could widen.
 *
 * <p><strong>Neither method is a delivery guarantee.</strong> Resubmission hands publications back to
 * the framework, which invokes the listener on {@code registryMailExecutor} (#383); whether the relay
 * accepts them is settled later and independently. A publication that fails again simply stays
 * outstanding, which is the registry's whole contract and why {@code riviera.outbox.pending} remains
 * the signal to watch.
 */
public interface MailOutbox {

	/**
	 * How many of this module's publications are still outstanding.
	 *
	 * <p>Under {@code completion-mode=archive} a completed publication is moved out of the live table
	 * altogether, so "outstanding" and "present" are the same question and a completed mail can never
	 * be counted here — the reason AC-5 holds without a completion check of its own.
	 */
	int countOutstanding();

	/**
	 * Hands every outstanding publication in scope back to the registry for delivery, returning how
	 * many were handed over.
	 *
	 * <p>The count is what the scope <em>matched</em>. In this deployment that equals what was
	 * resubmitted, because the framework's one skip condition — {@code markResubmitted} returning
	 * {@code false} — cannot fire: it is a {@code default} method returning {@code true} that the JDBC
	 * repository does not override (#405 finding 2). Should a future version implement the claim, the
	 * number degrades to an upper bound rather than becoming wrong.
	 */
	int resubmitOutstanding();
}
