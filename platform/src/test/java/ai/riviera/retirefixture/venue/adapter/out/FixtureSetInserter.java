package ai.riviera.retirefixture.venue.adapter.out;

/** An insert: a new row is active by construction, so it needs neither view nor marker. Must pass. */
final class FixtureSetInserter {

	static final String INSERT_SQL = """
			INSERT INTO set_position (venue_id, row_label, position_no, tier, pool,
			                          price_minor, price_currency, grid_x, grid_y)
			VALUES (:venue, :rowLabel, :positionNo, :tier, :pool,
			        :priceMinor, :priceCurrency, :gridX, :gridY)
			""";

	private FixtureSetInserter() {
	}
}
