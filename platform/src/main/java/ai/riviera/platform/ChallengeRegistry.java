package ai.riviera.platform;

import java.time.Instant;

/**
 * The proof-of-work challenge's single-use registry: each solved challenge is accepted exactly once,
 * enforced by the database rather than process memory (ADR-0016). Implemented on
 * {@code challenge_registry} by {@link JdbcChallengeRegistry}; the web slices substitute an
 * in-memory fake.
 */
interface ChallengeRegistry {

	/**
	 * Claim {@code challengeId} for this one submission. {@code true} only if this call inserted the
	 * row — a second claim of the same id, concurrent or later, answers {@code false}.
	 */
	boolean claim(String challengeId, Instant expiresAt);

	/** Delete every row whose expiry lies before {@code cutoff}; returns how many went. */
	int deleteExpiredBefore(Instant cutoff);
}
