package ai.riviera.platform.customer.application;

import java.util.Optional;

import ai.riviera.platform.customer.vocabulary.CustomerAccountCredential;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
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

	/** The account id for this normalized email, or empty if no account exists (S3 identity resolution). */
	Optional<CustomerAccountId> findIdByEmail(String normalizedEmail);

	/**
	 * Claim the email for a new account if free (atomic {@code INSERT … ON CONFLICT DO NOTHING}):
	 * {@link RegistrationOutcome.Registered} with the new id if this call created the row, else
	 * {@link RegistrationOutcome.AlreadyRegistered}, race-safe against a concurrent duplicate.
	 */
	RegistrationOutcome insertIfAbsent(String normalizedEmail, String passwordHash);

	/**
	 * Resolve-or-create the account for an external {@code (provider, subject)}, idempotent and
	 * race-safe ({@code ON CONFLICT DO NOTHING}). A returning subject reuses its account; a new one
	 * auto-links to the account holding its verified email, else gets a new password-less account.
	 */
	CustomerAccountId resolveSsoAccount(SsoProvider provider, String subject, String normalizedEmail);

	/**
	 * Mark the account's email verified — sets {@code email_verified = true} +
	 * {@code email_verified_at = NOW()}, idempotent: it only writes rows still {@code false}, so a repeat
	 * (e.g. a returning SSO sign-in) does not churn the timestamp.
	 */
	void markEmailVerified(CustomerAccountId accountId);

	/**
	 * Set the account's opaque password hash — an unconditional {@code UPDATE}. The edge has
	 * already authorized the write (token-proven reset or authenticated set-password) and encoded the hash.
	 * Also gives a password-less SSO-only account its first local password (closes S4 F-1).
	 */
	void updatePasswordHash(CustomerAccountId accountId, String passwordHash);

	/** Whether the email's account is verified; empty if no account exists. */
	Optional<Boolean> emailVerifiedFor(String normalizedEmail);

	/** The account's (normalized) email — its session principal name (for reset session revocation). */
	String emailOf(CustomerAccountId accountId);
}
