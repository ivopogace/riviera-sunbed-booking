package ai.riviera.platform.customer.application;

import java.util.Optional;

import ai.riviera.platform.customer.vocabulary.CustomerAccountId;

/**
 * Driven (outbound) persistence port for the right-to-erasure scrub — internal to the module (not a
 * published named interface), implemented by {@code adapter/out}'s {@code JdbcAccountErasure}
 * (invariant #1 — JDBC only). Deliberately a single port spanning every PII-bearing {@code customer}
 * table ({@code customer}, {@code customer_account}, {@code customer_sso_identity},
 * {@code customer_account_token}), so "what erasure touches" lives in exactly one adapter.
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

	/** As {@link #eraseAccountById} but selecting the account by its live, normalized email. */
	boolean eraseAccountByEmail(String normalizedEmail);

	/**
	 * Tombstone every live guest {@code customer} row with this normalized email (email → non-PII
	 * placeholder, {@code full_name}/{@code phone} → {@code 'ERASED'}, {@code erased_at} → now). Returns the
	 * number of rows scrubbed.
	 */
	int eraseGuestByEmail(String normalizedEmail);
}
