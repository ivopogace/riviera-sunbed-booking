package ai.riviera.platform.venue.adapter.in;

import ai.riviera.platform.venue.api.MoneyView;
import ai.riviera.platform.venue.application.SetCommand;

/**
 * The request body for placing/editing one set position ({@code POST}/{@code PATCH}
 * {@code /api/venues/{id}/sets...}, U7). Reuses the published {@link MoneyView} shape for price so
 * the write contract matches the U1 read contract exactly — integer minor units + ISO currency
 * (invariant #5), no float. {@link #toCommand()} checks presence and delegates range/token
 * validation to {@link SetCommand}; bad input → {@link IllegalArgumentException} → {@code 400}.
 *
 * <p><strong>The full set body is required on edit too</strong> — {@code PATCH} here replaces the
 * whole set position (the editor always re-sends every field), so a partial body is rejected
 * {@code 400}. This keeps a set's fields mutually consistent (e.g. a pool change can't be applied
 * without re-stating its cell), which matters for the layout-uniqueness checks.
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
		return new SetCommand(rowLabel, positionNo, tier, pool,
				price.minorUnits(), price.currency(), gridX, gridY);
	}
}
