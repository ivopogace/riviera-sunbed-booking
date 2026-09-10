package ai.riviera.responsibilityfixture.payout.adapter.out;

/**
 * The {@code payout} module's own settings adapter, in fixture form: the sole-writer rule must NOT
 * flag it. Without this the negative proof would pass for the wrong reason — a rule that rejected
 * every reference, the module's included, would look green against the rogue writer alone.
 */
final class FixtureJdbcVenueChangeFeeSetting {

	static final String READ_SQL = """
			SELECT amount_minor, currency
			FROM platform_setting
			WHERE setting_key = :key
			""";

	private FixtureJdbcVenueChangeFeeSetting() {
	}
}
