package ai.riviera.platform.customer.application;

import java.util.Optional;

import ai.riviera.platform.customer.vocabulary.CustomerAccountCredential;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.LiveAccountCredential;
import ai.riviera.platform.customer.vocabulary.RegistrationOutcome;
import ai.riviera.platform.customer.vocabulary.SsoProvider;

/**
 * Driven (outbound) persistence port for customer <em>accounts</em>, implemented by
 * {@code JdbcCustomerAccounts} (invariant #1). Separate from the guest-contact
 * {@code CustomerDirectory}: the account identity is deliberately distinct from the guest row.
 * Emails arrive normalized by {@link CustomerAccountService}. {@code public} only so the module's
 * own {@code adapter/out} can implement it; not a {@code @NamedInterface}, so no other module can
 * depend on it (invariant #11, enforced by {@code ModularityTests}).
 */
public interface CustomerAccountStore {

	/**
	 * The stored <em>password</em> credential for this normalized email, or empty if no account
	 * exists <em>or it has no local password</em> (SSO-only, null hash), so password login stays a
	 * generic 401 for SSO-only accounts (non-enumeration).
	 */
	Optional<CustomerAccountCredential> findByEmail(String normalizedEmail);

	/** The live account with this normalized email, null hash for SSO-only; empty if gone or erased. */
	Optional<LiveAccountCredential> findLiveCredential(String normalizedEmail);

	/** The live account with this id; empty if gone or erased. */
	Optional<LiveAccountCredential> findLiveCredential(CustomerAccountId accountId);

	/** The account id for this normalized email, or empty if no account exists */
	Optional<CustomerAccountId> findIdByEmail(String normalizedEmail);

	/**
	 * Claim the email for a new account if free (atomic {@code INSERT … ON CONFLICT DO NOTHING}):
	 * {@link RegistrationOutcome.Registered} with the new id if this call created the row, else
	 * {@link RegistrationOutcome.AlreadyRegistered}, race-safe against a concurrent duplicate.
	 */
	RegistrationOutcome insertIfAbsent(String normalizedEmail, String passwordHash);

	/** The live account an external {@code (provider, subject)} is linked to, or empty for a first sign-in. */
	Optional<CustomerAccountId> accountForSsoIdentity(SsoProvider provider, String subject);

	/**
	 * Find-or-create the account for an SSO email: a new password-less account if the email is free
	 * ({@code ON CONFLICT DO NOTHING}), else the one holding it; empty when that one lost the email meanwhile.
	 */
	Optional<SsoAccountClaim> claimAccountForSso(String normalizedEmail);

	/**
	 * Link {@code (provider, subject)} to the account, taking it over from an erased one, unless a concurrent first
	 * sign-in linked it to a live account first; answers the account it is linked to, empty when that link is gone.
	 */
	Optional<CustomerAccountId> linkSsoIdentity(CustomerAccountId accountId, SsoProvider provider, String subject,
			String normalizedEmail);

	/** Delete a password-less account this transaction created and then lost its identity for. */
	void deleteUnlinkedAccount(CustomerAccountId accountId);

	/**
	 * Mark the live account's email verified — sets {@code email_verified = true} + {@code email_verified_at = NOW()},
	 * idempotent: it only writes rows still {@code false}, so a repeat does not churn the timestamp.
	 */
	void markEmailVerified(CustomerAccountId accountId);

	/**
	 * Lock the account row {@code FOR NO KEY UPDATE} (a token insert's key check still passes) for the caller's
	 * transaction, in a statement of its own; false when gone or erased. Before its token rows, as erasure (#1305).
	 */
	boolean lockLiveAccount(CustomerAccountId accountId);

	/**
	 * Set the live account's opaque password hash: the token-proven reset's write, authorized and encoded at the
	 * edge; it also gives an SSO-only account its first password.
	 */
	void updatePasswordHash(CustomerAccountId accountId, String passwordHash);

	/**
	 * Write the hash only while the live account still stores {@code expectedHash} ({@code null}: no password yet),
	 * one guarded statement; false when a concurrent reset or change got there first.
	 */
	boolean replacePasswordHash(CustomerAccountId accountId, String expectedHash, String passwordHash);

	/** Whether the email's account is verified; empty if no account exists. */
	Optional<Boolean> emailVerifiedFor(String normalizedEmail);

	/** The account's (normalized) email — its session principal name (for reset session revocation). */
	String emailOf(CustomerAccountId accountId);
}
