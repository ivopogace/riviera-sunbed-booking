package ai.riviera.retirefixture.venue.adapter.out;

/** The retire path itself: a write on the bare table that names the marker. Must pass. */
final class FixtureSetRetirer {

	static final String RETIRE_SQL = """
			UPDATE set_position
			SET retired_at = :retiredAt
			WHERE id = :setId AND venue_id = :venue AND retired_at IS NULL
			""";

	private FixtureSetRetirer() {
	}
}
