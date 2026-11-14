package ai.riviera.platform.auth.application;

import java.time.Clock;
import java.time.Instant;

import org.springframework.stereotype.Component;

/**
 * Mints the token behind an admin-issued operator reset link (#1737) with the customer reset's posture:
 * {@link RecoveryTokens}' 256-bit token and SHA-256 digest, {@link RecoveryProperties#resetTokenTtl()}'s
 * lifetime. Only the digest goes to {@code operator}; the raw token is answered once to the admin and
 * never stored or logged (invariant #7).
 */
@Component
public class OperatorResetLinks {

	/** A fresh token: the raw value for the admin, its digest for the store, and when it lapses. */
	public record MintedToken(String rawToken, String tokenHash, Instant expiresAt) {

		@Override
		public String toString() {
			return "MintedToken[expiresAt=" + expiresAt + "]";
		}
	}

	private final RecoveryTokens tokens;
	private final RecoveryProperties properties;
	private final Clock clock;

	public OperatorResetLinks(RecoveryTokens tokens, RecoveryProperties properties, Clock clock) {
		this.tokens = tokens;
		this.properties = properties;
		this.clock = clock;
	}

	public MintedToken mint() {
		String rawToken = tokens.generate();
		return new MintedToken(rawToken, tokens.hash(rawToken), clock.instant().plus(properties.resetTokenTtl()));
	}

	/** The digest a presented raw token is stored under. */
	public String hash(String rawToken) {
		return tokens.hash(rawToken);
	}
}
