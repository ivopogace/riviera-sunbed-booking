package ai.riviera.platform.venue.vocabulary;

import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * One cell of a bulk beach-map layout as {@code remodel} hands it to {@code venue} to commit:
 * the save body's set — position number, the tier token as {@code set_position_tier_check} states it,
 * the pool, the price as EUR minor units of at least €0.50 ({@link SetPrice}, invariant #5) and the
 * 1-based grid cell, its row one of {@link SetPlacement#MAX_GRID_ROWS} (the row label is the row's
 * letter, never sent). Validated on construction to the save's own rules (the V12/V76/V77 CHECKs), so {@code remodel} can refuse a malformed cell as
 * {@code 400} before any lock is taken; {@code venue} re-validates on the way in.
 */
public record LayoutCell(int positionNo, String tier, Pool pool, long priceMinor,
		String priceCurrency, int gridX, int gridY) {

	private static final Set<String> TIERS =
			Stream.of(Tier.values()).map(Enum::name).collect(Collectors.toUnmodifiableSet());

	public LayoutCell {
		if (positionNo < 1) {
			throw new IllegalArgumentException("positionNo must be >= 1");
		}
		if (!TIERS.contains(tier)) {
			throw new IllegalArgumentException("tier must be one of " + TIERS);
		}
		if (pool == null) {
			throw new IllegalArgumentException("pool is required");
		}
		SetPrice.require(priceMinor, priceCurrency);
		if (gridX < 1) {
			throw new IllegalArgumentException("gridX must be >= 1");
		}
		SetPlacement.rowLabelOf(gridY);
	}
}
