package ai.riviera.retirefixture.venue.adapter.out;

/** The sanctioned read: through the active view, so a retired set is never listed. Must pass. */
final class FixtureActiveSetReader {

	static final String SETS_OF_VENUE_SQL = """
			SELECT id, row_label, position_no
			FROM active_set_position
			WHERE venue_id = :venue
			ORDER BY grid_y, grid_x
			""";

	private FixtureActiveSetReader() {
	}
}
