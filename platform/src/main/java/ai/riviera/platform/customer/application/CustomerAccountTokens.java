package ai.riviera.platform.customer.application;

import java.time.Instant;
import java.util.Optional;

import ai.riviera.platform.customer.vocabulary.CustomerAccountId;

/**
 * Driven (outbound) persistence port for customer account <em>recovery tokens</em> — internal to the
 * module (not a published named interface), implemented by {@code adapter/out}'s
 * {@code JdbcCustomerAccountTokens} (invariant #1 — JDBC only). A {@code public} interface so the
 * module's own {@code adapter/out} can implement it across the sub-package boundary (like
 * {@link CustomerAccountStore}); it is <em>not</em> a {@code @NamedInterface}, so no other module can
 * depend on it (invariant #11, enforced by {@code ModularityTests}).
 */
public interface CustomerAccountTokens {

	/**
	 * Store a token digest for the account, invalidating any prior unconsumed token of the same purpose
	 * first (only the newest link works). Atomic — invoked within the service's {@code @Transactional}.
	 */
	void issue(CustomerAccountId accountId, TokenPurpose purpose, String tokenHash, Instant expiresAt);

	/**
	 * Atomically claim a single, unexpired, not-yet-consumed token by {@code (purpose, tokenHash)},
	 * returning its account id, or empty if none matches (unknown / expired / already used —
	 * indistinguishable). The claim marks the row consumed in the same statement, so concurrent redeemers
	 * cannot both succeed (single-use).
	 */
	Optional<CustomerAccountId> consume(TokenPurpose purpose, String tokenHash);
}
