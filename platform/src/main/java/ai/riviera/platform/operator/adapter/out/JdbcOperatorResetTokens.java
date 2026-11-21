package ai.riviera.platform.operator.adapter.out;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.operator.application.OperatorResetTokens;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.OperatorStatus;

/**
 * JDBC adapter for {@link OperatorResetTokens} (invariant #1). A token is live while unconsumed and its
 * {@code expires_at} is after {@code :now}, the injected {@link Clock} that {@code auth} mints the expiry from, so each
 * comparison and stamp reads one time source (invariant #6); {@link #consume} is one guarded {@code UPDATE … RETURNING},
 * so at most one redeemer wins.
 */
@Repository
class JdbcOperatorResetTokens implements OperatorResetTokens {

	private static final String ID_PARAM = "id";
	private static final String TOKEN_HASH_PARAM = "tokenHash";
	private static final String ACTIVE_PARAM = "active";
	private static final String NOW_PARAM = "now";

	private final JdbcClient jdbc;
	private final Clock clock;

	JdbcOperatorResetTokens(JdbcClient jdbc, Clock clock) {
		this.jdbc = jdbc;
		this.clock = clock;
	}

	@Override
	public Optional<String> lockActiveOperator(OperatorId operatorId) {
		return jdbc.sql("SELECT username FROM operator WHERE id = :id AND status = :active FOR NO KEY UPDATE")
				.param(ID_PARAM, operatorId.value())
				.param(ACTIVE_PARAM, OperatorStatus.ACTIVE.name())
				.query(String.class)
				.optional();
	}

	@Override
	public boolean operatorExists(OperatorId operatorId) {
		return jdbc.sql("SELECT EXISTS (SELECT 1 FROM operator WHERE id = :id)")
				.param(ID_PARAM, operatorId.value())
				.query(Boolean.class)
				.single();
	}

	@Override
	public void retireAll(OperatorId operatorId) {
		jdbc.sql("""
				UPDATE operator_password_reset_token SET consumed_at = :now
				WHERE operator_id = :id AND consumed_at IS NULL
				""")
				.param(ID_PARAM, operatorId.value())
				.param(NOW_PARAM, now())
				.update();
	}

	@Override
	public void insert(OperatorId operatorId, String tokenHash, Instant expiresAt) {
		jdbc.sql("""
				INSERT INTO operator_password_reset_token (operator_id, token_hash, expires_at)
				VALUES (:id, :tokenHash, :expiresAt)
				""")
				.param(ID_PARAM, operatorId.value())
				.param(TOKEN_HASH_PARAM, tokenHash)
				.param("expiresAt", Timestamp.from(expiresAt))
				.update();
	}

	@Override
	public Optional<OperatorId> operatorFor(String tokenHash) {
		return jdbc.sql("""
				SELECT operator_id FROM operator_password_reset_token
				WHERE token_hash = :tokenHash AND consumed_at IS NULL AND expires_at > :now
				""")
				.param(TOKEN_HASH_PARAM, tokenHash)
				.param(NOW_PARAM, now())
				.query(Long.class)
				.optional()
				.map(OperatorId::new);
	}

	@Override
	public Optional<String> activeUsernameFor(String tokenHash) {
		return jdbc.sql("""
				SELECT o.username FROM operator_password_reset_token t JOIN operator o ON o.id = t.operator_id
				WHERE t.token_hash = :tokenHash AND t.consumed_at IS NULL AND t.expires_at > :now
				  AND o.status = :active
				""")
				.param(TOKEN_HASH_PARAM, tokenHash)
				.param(ACTIVE_PARAM, OperatorStatus.ACTIVE.name())
				.param(NOW_PARAM, now())
				.query(String.class)
				.optional();
	}

	@Override
	public boolean consume(OperatorId operatorId, String tokenHash) {
		return jdbc.sql("""
				UPDATE operator_password_reset_token SET consumed_at = :now
				WHERE token_hash = :tokenHash AND operator_id = :id
				  AND consumed_at IS NULL AND expires_at > :now
				RETURNING id
				""")
				.param(TOKEN_HASH_PARAM, tokenHash)
				.param(ID_PARAM, operatorId.value())
				.param(NOW_PARAM, now())
				.query(Long.class)
				.optional()
				.isPresent();
	}

	@Override
	public void storePassword(OperatorId operatorId, String passwordHash) {
		jdbc.sql("UPDATE operator SET password_hash = :hash WHERE id = :id")
				.param("hash", passwordHash)
				.param(ID_PARAM, operatorId.value())
				.update();
	}

	private Timestamp now() {
		return Timestamp.from(clock.instant());
	}
}
