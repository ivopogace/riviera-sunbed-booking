package ai.riviera.platform.operator.application;

import java.time.Instant;
import java.util.Optional;

import ai.riviera.platform.operator.vocabulary.OperatorId;

/**
 * Driven persistence port for operator password-reset tokens (#1737), implemented by {@code adapter/out}'s
 * {@code JdbcOperatorResetTokens} (invariant #1); public for that adapter, never a named interface. A write
 * takes the operator row first ({@link #lockActiveOperator}), the order a suspend takes, then the token rows.
 */
public interface OperatorResetTokens {

	/** Lock the operator row {@code FOR NO KEY UPDATE} while it is {@code ACTIVE}; its username, else empty. */
	Optional<String> lockActiveOperator(OperatorId operatorId);

	/** Whether an operator with this id exists, in any status. */
	boolean operatorExists(OperatorId operatorId);

	/** Consume every unconsumed token of this operator. */
	void retireAll(OperatorId operatorId);

	/** Store a new token digest; at most one unconsumed per operator (V82's partial unique index). */
	void insert(OperatorId operatorId, String tokenHash, Instant expiresAt);

	/** The operator a live token belongs to, whatever its status; consumes nothing. */
	Optional<OperatorId> operatorFor(String tokenHash);

	/** The username behind a live token while its operator is {@code ACTIVE}; consumes nothing. */
	Optional<String> activeUsernameFor(String tokenHash);

	/** Atomically consume this operator's live token; false when it was used, retired or expired meanwhile. */
	boolean consume(OperatorId operatorId, String tokenHash);

	/** Store the already-encoded password hash. */
	void storePassword(OperatorId operatorId, String passwordHash);
}
