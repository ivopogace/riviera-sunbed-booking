package ai.riviera.platform.notification.application;

import java.time.Instant;

/**
 * The do-not-mail list (#382) — the module's first owned state, and the seam its defining invariant
 * hangs on: <strong>no send to a suppressed address</strong>, consulted by
 * {@link TransactionalMailService} on every send, on both delivery vehicles. Provider-agnostic in
 * this slice: {@link #suppress} is the internal write path the Scaleway TEM bounce/complaint feed
 * (the follow-up {@code adapter/in}, out of scope here — epic #367 story 10) will drive; nothing
 * else writes, and entries are never deleted (the table is a durable deliverability record, not a
 * cache).
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
	 * and {@code last_event_at} while keeping the original {@code first_suppressed_at}. A value with
	 * no {@code local@domain} shape is rejected with {@link IllegalArgumentException} — entries are
	 * never deleted, so a junk write would persist forever.
	 */
	void suppress(String email, SuppressionReason reason, Instant at);
}
