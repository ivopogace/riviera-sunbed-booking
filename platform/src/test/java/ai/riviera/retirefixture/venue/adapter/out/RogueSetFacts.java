package ai.riviera.retirefixture.venue.adapter.out;

/**
 * A facts-port implementor whose spot read dropped the view — {@code JdbcSetBookingFacts}'
 * {@code ACTIVE_SPOTS_SELECT} copied with {@code set_position} in its place. Not an exempt name, so
 * it must be rejected despite the class it sits in.
 */
final class RogueSetFacts extends FixtureSetFacts {

	static final String ACTIVE_SPOTS_SELECT = """
			SELECT id, row_label, position_no, grid_x, grid_y, tier, pool
			FROM set_position
			WHERE venue_id = :venue
			""";
}
