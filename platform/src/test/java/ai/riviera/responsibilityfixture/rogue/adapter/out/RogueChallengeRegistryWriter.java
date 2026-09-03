package ai.riviera.responsibilityfixture.rogue.adapter.out;

/**
 * A would-be second writer of the {@code challenge_registry} table from outside the
 * {@code challenge} module — the violation of §{@code challenge}'s "only writer" clause that
 * {@code ResponsibilitiesArchitectureTests}' sole-writer rule must reject. A claim written anywhere
 * else is a second opinion on whether a solved challenge has been spent, which is the one thing the
 * table exists to settle. The SQL text block below puts the table name in this class's constant
 * pool, which is what the bytecode scan keys on.
 */
final class RogueChallengeRegistryWriter {

	static final String CLAIM_SQL = """
			INSERT INTO challenge_registry (challenge_id, expires_at)
			VALUES (:id, :expiresAt)
			ON CONFLICT (challenge_id) DO NOTHING
			""";

	private RogueChallengeRegistryWriter() {
	}
}
