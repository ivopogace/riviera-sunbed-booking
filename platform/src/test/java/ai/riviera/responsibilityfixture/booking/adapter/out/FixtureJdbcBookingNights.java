package ai.riviera.responsibilityfixture.booking.adapter.out;

/**
 * The {@code booking} module's own attendance adapter, in fixture form: the sole-writer rule must
 * NOT flag it. Without this the negative proof would pass for the wrong reason — a rule that
 * rejected every reference, the module's included, would look green against the rogue writer alone.
 */
final class FixtureJdbcBookingNights {

	static final String CHECK_IN_SQL = """
			UPDATE booking_night SET attended_at = :at
			WHERE booking_id = :id AND night = :night AND attended_at IS NULL AND missed_at IS NULL
			""";

	private FixtureJdbcBookingNights() {
	}
}
