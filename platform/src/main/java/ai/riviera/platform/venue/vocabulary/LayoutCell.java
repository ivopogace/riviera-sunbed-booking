package ai.riviera.platform.venue.vocabulary;

import java.util.Currency;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * One cell of a bulk beach-map layout as the edge hands it to {@code venue} for the remodel commit:
 * the save body's set, verbatim — row label, position number, the tier token as
 * {@code set_position_tier_check} states it, the pool, the price in integer minor units with its
 * ISO currency (invariant #5) and the 1-based grid cell. Validated on construction to the rules the
 * save's own cells obey (the V2/V12/V43 CHECKs), so the edge can refuse a malformed cell as
 * {@code 400} before any lock is taken; {@code venue} re-validates on the way in.
 */
public record LayoutCell(String rowLabel, int positionNo, String tier, Pool pool, long priceMinor,
		String priceCurrency, int gridX, int gridY) {

	private static final int MAX_ROW_LABEL_LENGTH = 40;
	private static final Set<String> TIERS =
			Stream.of(Tier.values()).map(Enum::name).collect(Collectors.toUnmodifiableSet());

	public LayoutCell {
		rowLabel = rowLabel == null ? null : rowLabel.strip();
		if (rowLabel == null || rowLabel.isBlank()) {
			throw new IllegalArgumentException("rowLabel is required");
		}
		if (rowLabel.codePointCount(0, rowLabel.length()) > MAX_ROW_LABEL_LENGTH) {
			throw new IllegalArgumentException("rowLabel must be at most " + MAX_ROW_LABEL_LENGTH + " characters");
		}
		if (positionNo < 1) {
			throw new IllegalArgumentException("positionNo must be >= 1");
		}
		if (!TIERS.contains(tier)) {
			throw new IllegalArgumentException("tier must be one of " + TIERS);
		}
		if (pool == null) {
			throw new IllegalArgumentException("pool is required");
		}
		if (priceMinor < 0) {
			throw new IllegalArgumentException("priceMinor must be >= 0");
		}
		requireIsoCurrency(priceCurrency);
		if (gridX < 1 || gridY < 1) {
			throw new IllegalArgumentException("gridX and gridY must be >= 1");
		}
	}

	private static void requireIsoCurrency(String code) {
		if (code == null || code.isBlank()) {
			throw new IllegalArgumentException("priceCurrency is required");
		}
		try {
			Currency.getInstance(code);
		}
		catch (IllegalArgumentException e) {
			throw new IllegalArgumentException("priceCurrency must be an ISO-4217 currency code", e);
		}
	}
}
