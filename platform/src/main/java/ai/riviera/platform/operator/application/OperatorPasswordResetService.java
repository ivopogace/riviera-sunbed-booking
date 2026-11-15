package ai.riviera.platform.operator.application;

import java.time.Instant;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.operator.api.OperatorPasswordReset;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.OperatorResetOutcome;
import ai.riviera.platform.operator.vocabulary.ResetLinkOutcome;

/**
 * Admin-issued reset tokens behind {@link OperatorPasswordReset} (#1737). Each write locks the operator row
 * while {@code ACTIVE} before touching its tokens, so it serializes with a suspend (which retires them) and
 * with a second issue. Rationale: RESPONSIBILITIES.md §operator.
 */
@Service
class OperatorPasswordResetService implements OperatorPasswordReset {

	private final OperatorResetTokens tokens;
	private final OperatorSsoIdentities ssoIdentities;

	OperatorPasswordResetService(OperatorResetTokens tokens, OperatorSsoIdentities ssoIdentities) {
		this.tokens = tokens;
		this.ssoIdentities = ssoIdentities;
	}

	@Override
	@Transactional
	public ResetLinkOutcome issue(OperatorId operatorId, String tokenHash, Instant expiresAt) {
		if (tokens.lockActiveOperator(operatorId).isEmpty()) {
			return tokens.operatorExists(operatorId) ? new ResetLinkOutcome.NotActive()
					: new ResetLinkOutcome.NoSuchOperator();
		}
		tokens.retireAll(operatorId);
		tokens.insert(operatorId, tokenHash, expiresAt);
		return new ResetLinkOutcome.Issued();
	}

	@Override
	@Transactional(readOnly = true)
	public Optional<String> usernameForResetToken(String tokenHash) {
		return tokens.activeUsernameFor(tokenHash);
	}

	@Override
	@Transactional
	public OperatorResetOutcome resetPassword(String tokenHash, String passwordHash) {
		Optional<OperatorId> owner = tokens.operatorFor(tokenHash);
		Optional<String> username = owner.flatMap(tokens::lockActiveOperator);
		if (owner.isEmpty() || username.isEmpty() || !tokens.consume(owner.get(), tokenHash)) {
			return new OperatorResetOutcome.InvalidOrExpired();
		}
		tokens.storePassword(owner.get(), passwordHash);
		ssoIdentities.deleteAll(owner.get());
		return new OperatorResetOutcome.Reset(username.get());
	}
}
