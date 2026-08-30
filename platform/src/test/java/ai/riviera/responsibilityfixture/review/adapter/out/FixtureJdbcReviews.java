package ai.riviera.responsibilityfixture.review.adapter.out;

/**
 * Review-table SQL <em>inside</em> the fixture {@code review} module — must NOT be flagged
 * by {@code ResponsibilitiesArchitectureTests}' review-table rule, proving the owner-module
 * exclusion path of the collector (not just the violation path).
 */
final class FixtureJdbcReviews {

	static final String CLAIM_SQL = """
			INSERT INTO review (booking_id, venue_id, stars, created_at)
			VALUES (:booking, :venue, :stars, :at)
			ON CONFLICT (booking_id) DO NOTHING
			""";

	private FixtureJdbcReviews() {
	}
}
