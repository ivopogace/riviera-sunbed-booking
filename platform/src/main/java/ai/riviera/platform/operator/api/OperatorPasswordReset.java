package ai.riviera.platform.operator.api;

import java.time.Instant;
import java.util.Optional;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.OperatorResetOutcome;
import ai.riviera.platform.operator.vocabulary.ResetLinkOutcome;

/**
 * Admin-issued operator password reset (#1737), the operator twin of {@code CustomerAccountRecovery}: the
 * module stores only the token's digest and an already-encoded hash; minting, hashing, the endpoints and
 * session revocation are the edge's (RV-BE-11). A token is single-use, expiring, one live per operator,
 * honoured only while the operator is {@code ACTIVE}. Rationale: RESPONSIBILITIES.md §operator.
 */
public interface OperatorPasswordReset {

	/** Store {@code tokenHash} for an {@code ACTIVE} operator, retiring its earlier links first. */
	ResetLinkOutcome issue(OperatorId operatorId, String tokenHash, Instant expiresAt);

	/** Whose password a token would reset now, consuming nothing, so the edge can revoke first. */
	Optional<String> usernameForResetToken(String tokenHash);

	/** Consume the token and store the already-encoded {@code passwordHash}, atomically. */
	OperatorResetOutcome resetPassword(String tokenHash, String passwordHash);
}
