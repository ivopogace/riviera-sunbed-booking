package ai.riviera.platform.venue.application.in;

import java.util.Set;

/**
 * The validated intent to place or re-place one set position on a venue's beach map (U7) —
 * used by both {@link EditBeachMap#addSet} and {@link EditBeachMap#editSet} (the editor is
 * incremental per-set CRUD). Its compact constructor enforces the same invariants the V2/V12
 * CHECK constraints enforce in the database, so a malformed set is rejected at the boundary:
 * {@code tier}/{@code pool} are the exact tokens the DB stores (a set is in exactly one
 * pool — invariant #3), {@code priceMinor} is integer minor units + an ISO-4217 currency
 * (invariant #5), and grid coordinates / position number are 1-based (invariant #12).
 */
public record SetCommand(String rowLabel, int positionNo, String tier, String pool,
		long priceMinor, String priceCurrency, int gridX, int gridY) {

	private static final Set<String> TIERS = Set.of("PREMIUM", "STANDARD");
	private static final Set<String> POOLS = Set.of("ONLINE", "WALK_IN");

	public SetCommand {
		NewVenueCommand.requireText(rowLabel, "rowLabel");
		if (positionNo < 1) {
			throw new IllegalArgumentException("positionNo must be >= 1");
		}
		if (!TIERS.contains(tier)) {
			throw new IllegalArgumentException("tier must be one of " + TIERS);
		}
		if (!POOLS.contains(pool)) {
			throw new IllegalArgumentException("pool must be one of " + POOLS);
		}
		if (priceMinor < 0) {
			throw new IllegalArgumentException("priceMinor must be >= 0");
		}
		NewVenueCommand.requireIsoCurrency(priceCurrency, "priceCurrency");
		if (gridX < 1 || gridY < 1) {
			throw new IllegalArgumentException("gridX and gridY must be >= 1");
		}
	}
}
