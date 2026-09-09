package ai.riviera.platform.venue.vocabulary;

/**
 * One cell of a bulk beach-map layout as the edge hands it to {@code venue} for the remodel commit:
 * the save body's set, verbatim — row label, position number, the tier token as
 * {@code set_position_tier_check} states it, the pool, the price in integer minor units with its
 * ISO currency (invariant #5) and the 1-based grid cell. A carrier, not a validator: {@code venue}
 * validates it exactly as it validates the save's own cells, so a malformed cell is refused with the
 * save's {@code 400}.
 */
public record LayoutCell(String rowLabel, int positionNo, String tier, Pool pool, long priceMinor,
		String priceCurrency, int gridX, int gridY) {
}
