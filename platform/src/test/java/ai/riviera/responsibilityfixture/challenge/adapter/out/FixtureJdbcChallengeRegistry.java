package ai.riviera.responsibilityfixture.challenge.adapter.out;

/**
 * The {@code challenge} module's own registry adapter, in fixture form: the sole-writer rule must
 * NOT flag it. Without this the negative proof would pass for the wrong reason — a rule that
 * rejected every reference, the module's included, would look green against the rogue writer alone.
 */
final class FixtureJdbcChallengeRegistry {

	static final String SWEEP_SQL = "DELETE FROM challenge_registry WHERE expires_at < :cutoff";

	private FixtureJdbcChallengeRegistry() {
	}
}
