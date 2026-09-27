package ai.riviera.responsibilityfixture.booking.adapter.out;

/**
 * The {@code booking} module's own stay adapter, in fixture form: the sole-writer rule must NOT flag
 * it, or the negative proof would pass for the wrong reason.
 */
final class FixtureJdbcStays {

	static final String INSERT_SQL = """
			INSERT INTO stay (code, venue_id, first_date, last_date) VALUES (:code, :venue, :first, :last)
			""";

	private FixtureJdbcStays() {
	}
}
