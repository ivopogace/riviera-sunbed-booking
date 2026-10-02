package ai.riviera.responsibilityfixture.booking.adapter.out;

/**
 * The {@code booking} module's own booking adapter, in fixture form: the table-ownership rule must
 * NOT flag it, or the negative proof would pass for the wrong reason.
 */
final class FixtureJdbcBookings {

	static final String CONFIRM_SQL = """
			UPDATE booking SET status = 'CONFIRMED' WHERE id = :id
			""";

	private FixtureJdbcBookings() {
	}
}
