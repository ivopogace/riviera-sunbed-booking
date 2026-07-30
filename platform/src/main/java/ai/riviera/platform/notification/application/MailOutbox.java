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
	 * <p><strong>The count is what the scope matched, which is an upper bound on what was actually
	 * re-driven.</strong> The registry claims each publication before invoking its listener
	 * ({@code markResubmitted}) and skips one whose previous resubmission is still in flight, so a
	 * press landing mid-drain legitimately reports more than it moved. Reporting the match is the
	 * honest number available through this API — the framework's resubmission entry point returns
	 * {@code void} — and it is the number an admin can act on: it says how much this module still owes,
	 * which is the question the console asks.
	 */
	int resubmitOutstanding();
}
