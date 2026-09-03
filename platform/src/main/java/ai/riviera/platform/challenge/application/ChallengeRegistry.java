package ai.riviera.platform.challenge.application;

import java.time.Instant;

/**
 * The proof-of-work challenge's single-use registry: each solved challenge is accepted exactly once,
 * enforced by the database rather than process memory (ADR-0016). The module's own outbound port:
 * only {@code adapter.out.JdbcChallengeRegistry} implements it, on {@code challenge_registry}, so it
 * is deliberately unpublished — neither {@code api} (nobody outside calls it) nor {@code spi} (no
 * other module implements it). Public only because its adapter and its sweep sit in sibling packages.
 */
public interface ChallengeRegistry {

	/**
	 * Claim {@code challengeId} for this one submission. {@code true} only if this call inserted the
	 * row — a second claim of the same id, concurrent or later, answers {@code false}.
	 */
	boolean claim(String challengeId, Instant expiresAt);

	/** Delete every row whose expiry lies before {@code cutoff}; returns how many went. */
	int deleteExpiredBefore(Instant cutoff);
}
