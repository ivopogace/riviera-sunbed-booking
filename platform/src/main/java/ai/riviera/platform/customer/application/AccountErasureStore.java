package ai.riviera.platform.customer.application;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.CustomerId;

/**
 * Internal persistence port for erasure, implemented by {@code JdbcAccountErasure} (invariant #1). One
 * port spans every PII-bearing {@code customer} table, so "what erasure touches" lives in one adapter;
 * reviews are reached through {@link ai.riviera.platform.customer.spi.ReviewErasure} with the ids the
 * by-email scrubs return. Every scrub acts only on a live row ({@code erased_at IS NULL}), so it is
 * idempotent, and tombstones in place, never a hard delete (booking FKs are {@code ON DELETE RESTRICT};
 * ADR-0010). Emails arrive already normalized by {@link AccountErasureService}.
 */
public interface AccountErasureStore {

	/** The account's currently-stored email, or empty if no such account exists (read before the scrub). */
	Optional<String> emailOfAccount(CustomerAccountId accountId);

	/**
	 * Tombstone the account row if still live (email → non-PII placeholder, {@code password_hash} → NULL,
	 * {@code erased_at} → now) and delete its {@code customer_sso_identity} + {@code customer_account_token}
	 * rows. Returns {@code true} iff a live account row was scrubbed (already-erased / absent → {@code false}).
	 */
	boolean eraseAccountById(CustomerAccountId accountId);

	/**
	 * As {@link #eraseAccountById} but selecting the account by its live, normalized email. Returns the id
	 * of the account scrubbed, or empty when no live account carries that email.
	 */
	Optional<CustomerAccountId> eraseAccountByEmail(String normalizedEmail);

	/**
	 * Tombstone every live guest {@code customer} row with this normalized email (email → non-PII
	 * placeholder, {@code full_name}/{@code phone} → {@code 'ERASED'}, {@code erased_at} → now). Returns the
	 * ids of the rows scrubbed — empty when none was live.
	 */
	List<CustomerId> eraseGuestByEmail(String normalizedEmail);

	/**
	 * Retention-sweep candidates: live guest rows with an id above {@code after}, updated before {@code olderThan},
	 * whose email no live {@code customer_account} claims; at most {@code limit}, by id. Not the third gate: the
	 * caller still drops guests with a recent booking via {@code customer.spi.GuestBookingHistory}.
	 */
	List<CustomerId> expiredGuestCandidates(Instant olderThan, CustomerId after, int limit);

	/**
	 * Tombstone one guest {@code customer} row by id, as {@link #eraseGuestByEmail} does, only while it still
	 * passes {@link #expiredGuestCandidates}' gates; {@code false} for a row a booking refreshed or an account
	 * claimed since the candidate read, or a tombstoned or absent one, so an overlapping sweep is a no-op.
	 */
	boolean eraseGuestById(CustomerId guestId, Instant olderThan);
}
