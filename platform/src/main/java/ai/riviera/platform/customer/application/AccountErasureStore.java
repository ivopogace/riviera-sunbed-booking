package ai.riviera.platform.customer.application;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.CustomerId;

/**
 * Driven (outbound) persistence port for the right-to-erasure scrub — internal to the module (not a
 * published named interface), implemented by {@code adapter/out}'s {@code JdbcAccountErasure}
 * (invariant #1 — JDBC only). Deliberately a single port spanning every PII-bearing {@code customer}
 * table ({@code customer}, {@code customer_account}, {@code customer_sso_identity},
 * {@code customer_account_token}), so "what erasure touches" in this module lives in exactly one
 * adapter; the one PII-bearing row outside it, the review, is reached through
 * {@link ai.riviera.platform.customer.spi.ReviewErasure} with the ids the by-email scrubs answer.
 *
 * <p>Every scrub is idempotent — it acts only on a live row ({@code erased_at IS NULL}) — and is
 * <strong>tombstone-in-place</strong>, never a hard delete of a row a retained booking references
 * (the {@code booking} FKs are {@code ON DELETE RESTRICT}). Emails reaching this port are already
 * normalized by {@link AccountErasureService}.
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
	 * Guest {@code customer} rows the automated retention sweep (Slice 2 of #101) may consider scrubbing:
	 * live rows ({@code erased_at IS NULL}) last touched before {@code olderThan} whose email is <em>not</em>
	 * claimed by a live {@code customer_account} — so a signed-up customer's contact is never a candidate.
	 *
	 * <p>These are the two gates this module can apply on its own tables; the third — whether the guest still
	 * has a booking inside the window — is the {@code booking}-owned fact behind
	 * {@code customer.spi.GuestBookingHistory}. The result is capped at {@code limit} and ordered by id, so a
	 * run is bounded and the remainder is picked up by the next one.
	 *
	 * @param olderThan the retention cutoff as an instant — rows updated at or after it are still in window
	 * @param limit     the batch cap
	 * @return the candidate guest ids, oldest id first, at most {@code limit} of them
	 */
	List<CustomerId> expiredGuestCandidates(Instant olderThan, int limit);

	/**
	 * Tombstone one live guest {@code customer} row by id — the retention sweep's per-row scrub, identical in
	 * effect to {@link #eraseGuestByEmail} but selecting by the candidate id it was just handed. Returns
	 * {@code true} iff a live row was scrubbed; an already-tombstoned or absent row yields {@code false},
	 * which is what makes a repeated or overlapping sweep a no-op.
	 */
	boolean eraseGuestById(CustomerId guestId);
}
