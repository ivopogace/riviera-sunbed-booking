package ai.riviera.platform.venue.adapter.in;

import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.application.SetCommand;

/**
 * The request body for placing/editing one set position ({@code POST}/{@code PATCH}
 * {@code /api/venues/{id}/sets...}): price in the published {@link MoneyView} shape — integer minor
 * units + ISO currency (invariant #5), no float. {@link #toCommand()} checks presence, parses the
 * pool via {@link PoolToken}, leaves range/tier checks to {@link SetCommand}; bad input → 400.
 * <strong>The full body is required on {@code PATCH} too</strong> (it replaces the whole set), so a
 * pool change can't land without re-stating its cell — the layout-uniqueness checks depend on it.
 */
record SetPositionRequest(String rowLabel, Integer positionNo, String tier, String pool,
		MoneyView price, Integer gridX, Integer gridY) {

	SetCommand toCommand() {
		if (positionNo == null) {
			throw new IllegalArgumentException("positionNo is required");
		}
		if (price == null) {
			throw new IllegalArgumentException("price is required");
		}
		if (gridX == null || gridY == null) {
			throw new IllegalArgumentException("gridX and gridY are required");
		}
		return new SetCommand(rowLabel, positionNo, tier, PoolToken.parse(pool),
				price.minorUnits(), price.currency(), gridX, gridY);
	}
}
