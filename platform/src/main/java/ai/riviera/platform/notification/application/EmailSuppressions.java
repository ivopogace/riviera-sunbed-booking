package ai.riviera.platform.notification.application;

import java.time.Instant;

/**
 * The do-not-mail list (#382) — the module's first owned state, and the seam its defining invariant
 * hangs on: <strong>no send to a suppressed address</strong>, consulted by
 * {@link TransactionalMailService} on every send, on both delivery vehicles. Provider-agnostic in
 * this slice: {@link #suppress} is the internal write path the Scaleway TEM bounce/complaint feed
 * (the follow-up {@code adapter/in}, out of scope here — epic #367 story 10) will drive.
 *
 * <p><strong>Entries are never deleted</strong> — the table is a durable deliverability record, not
 * a cache. Since #391 that contract has exactly <strong>one sanctioned exception, and it is still
 * not a deletion</strong>: {@link #reinstate} marks a row lifted rather than removing it, so the
 * deliverability history survives and a later bounce re-suppresses through the ordinary
 * {@link #suppress} upsert. A hard {@code DELETE} anywhere on this table remains a defect
 * (ADR-0012, as amended by #391).
 *
 * <p>Matching is on the <em>normalized</em> address — trimmed, lower-cased, the same canonical form
 * the {@code customer} module stores — applied by the adapter on both read and write, so a feed
 * reporting {@code Foo@Bar.com} still suppresses the checkout's {@code foo@bar.com}. Since
 * #388/ADR-0012 the stored state is <strong>non-PII</strong>: the adapter keys each row on a
 * peppered HMAC of the normalized address plus the cleartext domain, never the address itself —
 * the contract here is unchanged (callers still pass raw addresses; never-deleted stays, and the
 * entry deliberately survives right-to-erasure). Unpublished application-internal port,
 * implemented by {@code adapter/out} (invariant #11); timestamps are caller-supplied UTC instants
 * (invariant #6).
 */
public interface EmailSuppressions {

	/** Whether this address is on the do-not-mail list. */
	boolean isSuppressed(String email);

	/**
	 * Put the address on the do-not-mail list, or refresh it: a repeat suppression updates the reason
	 * and {@code last_event_at} while keeping the original {@code first_suppressed_at}, and
	 * <strong>clears any reinstatement</strong> (#391), so a bounce after a lift re-suppresses through
	 * this one path. A value with no {@code local@domain} shape is rejected with
	 * {@link IllegalArgumentException} — entries are never deleted, so a junk write would persist
	 * forever.
	 *
	 * <p><strong>This method's first production caller carries a security consequence</strong>, so it
	 * is worth knowing before adding one. While nothing writes the list, every {@link #isSuppressed}
	 * answer is {@code false} and #390's {@code emailWithheld} on the code-gated booking read is a
	 * constant rather than a per-address fact. Populating the list — the bounce/complaint feed (#372)
	 * is the intended first writer — makes that flag a real, if expensive, suppression oracle: an
	 * attacker books with a victim's address, pays, reads the flag, then cancels before the #4 cutoff
	 * for a full refund (invariant #10). A second precondition also has to hold, so this alone does
	 * not open it: the flag stays inert wherever {@code payment.api.CollectionGuarantee} reports that
	 * the wired gateway does not collect before confirming.
	 *
	 * <p>#400 item 2 assessed that probe and deferred it. Read the disposition in
	 * {@code docs/plans/suppressed-confirmation-mail-notice.md} (<em>Residual G-3</em>) before
	 * shipping #372: it records why a dedicated rate-limit budget would not bind, and why the
	 * "hand-off only" alternative does not exist under the {@code stripe} profile.
	 */
	void suppress(String email, SuppressionReason reason, Instant at);

	/**
	 * Lift the suppression on an address — <strong>the one sanctioned exception</strong> to the
	 * never-deleted record (#391), and still not a deletion: the row stays and gains a
	 * {@code reinstated_at} instant, so {@code first_suppressed_at} and the prior {@code reason}
	 * survive, a later bounce re-suppresses via {@link #suppress}, and a reinstatement loop remains
	 * visible to ops. Idempotent — a repeat call reports the original lift without moving it.
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
