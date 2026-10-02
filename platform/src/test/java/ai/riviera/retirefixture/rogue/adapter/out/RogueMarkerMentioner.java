package ai.riviera.retirefixture.rogue.adapter.out;

/**
 * A read that names the marker without testing it: {@code retired_at} in the select list, every
 * retired set still listed. A mention is not an exclusion, so it must be rejected.
 */
final class RogueMarkerMentioner {

	static final String SETS_WITH_RETIREMENT_SQL = """
			SELECT id, row_label, position_no, retired_at
			FROM set_position
			WHERE venue_id = :venue
			""";

	private RogueMarkerMentioner() {
	}
}
