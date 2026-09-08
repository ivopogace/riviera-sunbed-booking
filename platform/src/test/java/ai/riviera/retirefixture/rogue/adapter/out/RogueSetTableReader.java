package ai.riviera.retirefixture.rogue.adapter.out;

/**
 * A read of the set table that would list a retired set — the violation
 * {@code RetiredSetExclusionArchitectureTests} exists to reject: the bare table, no view, no marker.
 */
final class RogueSetTableReader {

	static final String SETS_OF_VENUE_SQL = """
			SELECT id, row_label, position_no
			FROM set_position
			WHERE venue_id = :venue
			""";

	private RogueSetTableReader() {
	}
}
