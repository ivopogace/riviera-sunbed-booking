package ai.riviera.responsibilityfixture.venue.adapter.out;

/**
 * The rating columns written <em>inside</em> the fixture {@code venue} module — must NOT be
 * flagged by {@code ResponsibilitiesArchitectureTests}' rating-columns rule, proving the
 * owner-module exclusion path of the collector (not just the violation path).
 */
final class FixtureVenueRatingWriter {

	static final String STORE_SQL = """
			UPDATE venue
			SET rating_tenths = :tenths, reviews_count = :count
			WHERE id = :id
			""";

	private FixtureVenueRatingWriter() {
	}
}
