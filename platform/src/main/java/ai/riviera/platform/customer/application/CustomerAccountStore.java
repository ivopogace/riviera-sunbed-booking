package ai.riviera.platform.customer.application;

import java.util.Optional;

import ai.riviera.platform.customer.vocabulary.CustomerAccountCredential;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.RegistrationOutcome;

/**
 * Driven (outbound) persistence port for customer <em>accounts</em> — internal to the module (not a
 * published named interface), implemented by {@code adapter/out}'s {@code JdbcCustomerAccounts}
 * (invariant #1 — JDBC only). Separate from the guest-contact {@code CustomerDirectory} (the account
 * identity is deliberately distinct from the guest row, design D-6). Emails reaching this port are
 * already normalized by {@link CustomerAccountService}.
 *
 * <p>A {@code public} interface (like {@code operator.application.Operators}) so the module's own
 * {@code adapter/out} can implement it across the sub-package boundary; it is <em>not</em> a published
 * {@code @NamedInterface}, so no other module can depend on it (invariant #11, enforced by
 * {@code ModularityTests}).
 */
public interface CustomerAccountStore {

	/** The stored credential for this normalized email, or empty if no account exists. */
	Optional<CustomerAccountCredential> findByEmail(String normalizedEmail);

	/** The account id for this normalized email, or empty if no account exists (S3 identity resolution). */
	Optional<CustomerAccountId> findIdByEmail(String normalizedEmail);

	/**
	 * Claim the email for a new account if it is free — an atomic {@code INSERT … ON CONFLICT DO
	 * NOTHING}. Returns {@link RegistrationOutcome.Registered} with the new id when this call created
	 * the row, or {@link RegistrationOutcome.AlreadyRegistered} when an account already held the email
	 * (race-safe: a concurrent duplicate gets {@code AlreadyRegistered}, never a second row).
	 */
	RegistrationOutcome insertIfAbsent(String normalizedEmail, String passwordHash);
}
