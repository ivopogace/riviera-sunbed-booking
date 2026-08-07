package ai.riviera.platform.notification.application;

import java.time.Instant;

/**
 * The do-not-mail list — the module's first owned state, and the seam its defining invariant hangs
 * on: <strong>no send to a suppressed address</strong>, consulted by {@link TransactionalMailService}
 * on every send, on both delivery vehicles. Provider-agnostic: {@link #suppress} is the internal write
 * path the bounce/complaint feed will drive.
 *
 * <p><strong>Entries are never deleted</strong> — the table is a durable deliverability record, not a
 * cache. There is exactly <strong>one sanctioned exception, and it is still not a deletion</strong>:
 * {@link #reinstate} marks a row lifted rather than removing it, so the history survives and a later
 * bounce re-suppresses through the ordinary {@link #suppress} upsert. A hard {@code DELETE} anywhere
 * on this table remains a defect (ADR-0012).
 *
 * <p>Matching is on the <em>normalized</em> address — trimmed, lower-cased, the same canonical form
 * {@code customer} stores — applied by the adapter on both read and write, so a feed reporting
 * {@code Foo@Bar.com} still suppresses the checkout's {@code foo@bar.com}. The stored state is
 * <strong>non-PII</strong>: a peppered HMAC of the normalized address plus the cleartext domain, never
 * the address itself. That is invisible here — callers still pass raw addresses, and the entry
 * deliberately survives right-to-erasure. Unpublished application-internal port, implemented by
 * {@code adapter/out} (invariant #11); timestamps are caller-supplied UTC instants (invariant #6).
 */
public interface EmailSuppressions {

	/** Whether this address is on the do-not-mail list. */
	boolean isSuppressed(String email);

	/**
	 * Put the address on the do-not-mail list, or refresh it: a repeat suppression updates the reason
	 * and {@code last_event_at} while keeping the original {@code first_suppressed_at}, and
	 * <strong>clears any reinstatement</strong>, so a bounce after a lift re-suppresses through this one
	 * path. A value with no {@code local@domain} shape is rejected with
	 * {@link IllegalArgumentException} — entries are never deleted, so a junk write would persist
	 * forever.
	 *
	 * <p><strong>This method's first production caller carries a security consequence.</strong> While
	 * nothing writes the list, every {@link #isSuppressed} answer is {@code false} and the
	 * {@code emailWithheld} flag on the code-gated booking read is a constant rather than a per-address
	 * fact. Populating the list makes that flag a real, if expensive, suppression oracle: an attacker
	 * books with a victim's address, pays, reads the flag, then cancels before the invariant-#4 cutoff
	 * for a full refund. A second precondition must also hold, so this alone does not open it — the flag
	 * stays inert wherever {@code payment.api.CollectionGuarantee} reports that the wired gateway does
	 * not collect before confirming. The probe was assessed and deferred; read the disposition in
	 * {@code docs/plans/suppressed-confirmation-mail-notice.md} (<em>Residual G-3</em>) before wiring a
	 * writer, since it records why a dedicated rate-limit budget would not bind.
	 */
	void suppress(String email, SuppressionReason reason, Instant at);

	/**
	 * Lift the suppression on an address — <strong>the one sanctioned exception</strong> to the
	 * never-deleted record, and still not a deletion: the row stays and gains a {@code reinstated_at}
	 * instant, so {@code first_suppressed_at} and the prior {@code reason} survive, a later bounce
	 * re-suppresses via {@link #suppress}, and a reinstatement loop remains visible to ops. Idempotent —
	 * a repeat call reports the original lift without moving it.
	 *
	 * <p>Deliberately <strong>does not validate the address shape</strong>, unlike {@link #suppress}.
	 * That guard exists because a junk <em>write</em> would persist forever; reinstating an address
	 * that is not on the list writes nothing, so {@link ReinstateOutcome.NotSuppressed} is the honest
	 * answer for junk input. Request-level validation belongs to the driving adapter.
	 *
	 * <p>This is an admin-initiated ops decision and never an automatic one — in particular it is not
	 * an erasure side-effect: ADR-0012's posture that the entry survives right-to-erasure is
	 * unchanged.
	 */
	ReinstateOutcome reinstate(String email, Instant at);
}
