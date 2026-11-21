package ai.riviera.platform.customer.adapter.out;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.customer.application.CustomerAccountTokens;
import ai.riviera.platform.customer.application.TokenPurpose;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;

/**
 * JDBC adapter for the {@code customer} module's {@link CustomerAccountTokens} port. Explicit SQL
 * via {@link JdbcClient} in text blocks, named params, package-private (invariant #1).
 *
 * <p>The single-use guarantee is the atomic {@code UPDATE … SET consumed_at = :now WHERE consumed_at IS NULL
 * AND expires_at > :now RETURNING account_id}: at most one concurrent redeemer wins; invalid / expired / consumed
 * tokens look alike (zero rows; non-enumeration, design D-8). {@code :now} is the injected {@link Clock}, the clock
 * {@code auth} mints {@code expires_at} from, so each comparison and stamp reads one time source (invariant #6).
 */
@Repository
class JdbcCustomerAccountTokens implements CustomerAccountTokens {

	/** SQL named-param keys, named not duplicated (conventions §6a). */
	private static final String ACCOUNT_ID = "accountId";
	private static final String PURPOSE = "purpose";
	private static final String TOKEN_HASH = "tokenHash";
	private static final String NOW = "now";

	private final JdbcClient jdbc;
	private final Clock clock;

	JdbcCustomerAccountTokens(JdbcClient jdbc, Clock clock) {
		this.jdbc = jdbc;
		this.clock = clock;
	}

	@Override
	public void issue(CustomerAccountId accountId, TokenPurpose purpose, String tokenHash, Instant expiresAt) {
		retireAll(accountId, purpose);
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
	public void retireAll(CustomerAccountId accountId, TokenPurpose purpose) {
		jdbc.sql("""
				UPDATE customer_account_token SET consumed_at = :now
				WHERE account_id = :accountId AND purpose = :purpose AND consumed_at IS NULL
				""")
				.param(ACCOUNT_ID, accountId.value())
				.param(PURPOSE, purpose.name())
				.param(NOW, now())
				.update();
	}

	/** {@link #consume}'s predicate as a read — a point lookup on the {@code token_hash} UNIQUE index. */
	@Override
	public Optional<CustomerAccountId> accountFor(TokenPurpose purpose, String tokenHash) {
		return jdbc.sql("""
				SELECT account_id FROM customer_account_token
				WHERE token_hash = :tokenHash AND purpose = :purpose
				  AND consumed_at IS NULL AND expires_at > :now
				""")
				.param(TOKEN_HASH, tokenHash)
				.param(PURPOSE, purpose.name())
				.param(NOW, now())
				.query(Long.class)
				.optional()
				.map(CustomerAccountId::new);
	}

	@Override
	public Optional<CustomerAccountId> consume(TokenPurpose purpose, String tokenHash) {
		return jdbc.sql("""
				UPDATE customer_account_token SET consumed_at = :now
				WHERE token_hash = :tokenHash AND purpose = :purpose
				  AND consumed_at IS NULL AND expires_at > :now
				RETURNING account_id
				""")
				.param(TOKEN_HASH, tokenHash)
				.param(PURPOSE, purpose.name())
				.param(NOW, now())
				.query(Long.class)
				.optional()
				.map(CustomerAccountId::new);
	}

	private Timestamp now() {
		return Timestamp.from(clock.instant());
	}
}
