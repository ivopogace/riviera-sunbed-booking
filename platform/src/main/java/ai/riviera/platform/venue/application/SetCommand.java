package ai.riviera.platform.venue.application;

import java.util.Set;

import ai.riviera.platform.venue.vocabulary.Pool;

/**
 * The validated intent to place or re-place one set position on a venue's beach map (U7) —
 * used by both {@link EditBeachMap#addSet} and {@link EditBeachMap#editSet} (the editor is
 * incremental per-set CRUD). Its compact constructor enforces the same invariants the V2/V12/V43
 * CHECK constraints enforce in the database, so a malformed set is rejected at the boundary:
 * {@code tier} is the exact token the DB stores and {@code pool} the typed {@link Pool} (a set is in
 * exactly one pool — invariant #3), {@code priceMinor} is integer minor units + an ISO-4217 currency
 * (invariant #5), and grid coordinates / position number are 1-based (the V12 CHECKs).
 */
public record SetCommand(String rowLabel, int positionNo, String tier, Pool pool,
		long priceMinor, String priceCurrency, int gridX, int gridY) {

	private static final Set<String> TIERS = Set.of("PREMIUM", "STANDARD");

	public SetCommand {
		rowLabel = VenueFieldValidation.strip(rowLabel);
		VenueFieldValidation.requireText(rowLabel, "rowLabel", VenueFieldValidation.MAX_ROW_LABEL_LENGTH);
		if (positionNo < 1) {
			throw new IllegalArgumentException("positionNo must be >= 1");
		}
		if (!TIERS.contains(tier)) {
			throw new IllegalArgumentException("tier must be one of " + TIERS);
		}
		if (pool == null) {
			throw new IllegalArgumentException("pool is required");
		}
		VenueFieldValidation.requireNonNegativeMinor(priceMinor, "priceMinor");
		VenueFieldValidation.requireIsoCurrency(priceCurrency, "priceCurrency");
		if (gridX < 1 || gridY < 1) {
			throw new IllegalArgumentException("gridX and gridY must be >= 1");
		}
	}
}
