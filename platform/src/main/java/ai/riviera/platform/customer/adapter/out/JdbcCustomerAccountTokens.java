package ai.riviera.platform.customer.adapter.out;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.customer.application.CustomerAccountTokens;
import ai.riviera.platform.customer.application.TokenPurpose;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;

/**
 * JDBC adapter for the {@code customer} module's {@link CustomerAccountTokens} port (ADR-0007
 * {@code adapter/out}). Explicit SQL via {@link JdbcClient} in text blocks, named params,
 * package-private (invariant #1, mirroring {@code JdbcCustomerAccounts}).
 *
 * <p>The single-use guarantee is the atomic {@code UPDATE … SET consumed_at = NOW() WHERE
 * consumed_at IS NULL AND expires_at > NOW() RETURNING account_id}: at most one concurrent redeemer
 * wins the row, and invalid / expired / already-consumed tokens are indistinguishable (zero rows
 * returned — non-enumeration, design D-8). Expiry compares against the DB clock ({@code NOW()}), so no
 * application clock crosses this seam.
 */
@Repository
class JdbcCustomerAccountTokens implements CustomerAccountTokens {

	/** SQL named-param keys, named not duplicated (invariant #6a). */
	private static final String ACCOUNT_ID = "accountId";
	private static final String PURPOSE = "purpose";
	private static final String TOKEN_HASH = "tokenHash";

	private final JdbcClient jdbc;

	JdbcCustomerAccountTokens(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public void issue(CustomerAccountId accountId, TokenPurpose purpose, String tokenHash, Instant expiresAt) {
		// Invalidate this account's prior unconsumed tokens of this purpose so only the newest link works.
		jdbc.sql("""
				UPDATE customer_account_token SET consumed_at = NOW()
				WHERE account_id = :accountId AND purpose = :purpose AND consumed_at IS NULL
				""")
				.param(ACCOUNT_ID, accountId.value())
				.param(PURPOSE, purpose.name())
				.update();
		jdbc.sql("""
				INSERT INTO customer_account_token (account_id, purpose, token_hash, expires_at)
				VALUES (:accountId, :purpose, :tokenHash, :expiresAt)
				""")
				.param(ACCOUNT_ID, accountId.value())
				.param(PURPOSE, purpose.name())
				.param(TOKEN_HASH, tokenHash)
				.param("expiresAt", Timestamp.from(expiresAt))
				.update();
	}

	@Override
	public Optional<CustomerAccountId> consume(TokenPurpose purpose, String tokenHash) {
		return jdbc.sql("""
				UPDATE customer_account_token SET consumed_at = NOW()
				WHERE token_hash = :tokenHash AND purpose = :purpose
				  AND consumed_at IS NULL AND expires_at > NOW()
				RETURNING account_id
				""")
				.param(TOKEN_HASH, tokenHash)
				.param(PURPOSE, purpose.name())
				.query(Long.class)
				.optional()
				.map(CustomerAccountId::new);
	}
}
