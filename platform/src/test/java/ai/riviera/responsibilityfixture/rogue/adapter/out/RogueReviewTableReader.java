package ai.riviera.responsibilityfixture.rogue.adapter.out;

/**
 * A would-be direct reader of the {@code review} table from outside the {@code review}
 * module — the "no illegal import, only its own SQL" breach {@code RESPONSIBILITIES.md}
 * §review names, which {@code ResponsibilitiesArchitectureTests}' review-table rule must
 * reject. The scan keys on SQL-shaped references (keyword + table name), because the bare
 * word "review" also appears in every legitimate consumer's constant pool as the module's
 * package name.
 */
final class RogueReviewTableReader {

	static final String AGGREGATE_SQL = """
			SELECT COUNT(*), COALESCE(SUM(stars), 0)
			FROM review
			WHERE venue_id = :venue
			""";

	private RogueReviewTableReader() {
	}
}
