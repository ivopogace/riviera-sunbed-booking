package ai.riviera.platform.venue.adapter.in;

import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.application.RowPriceCommand;

/**
 * The request body for repricing a beach-map row ({@code PUT /api/venues/{id}/rows/{rowLabel}/price},
 * O4 issue #174). Reuses the published {@link MoneyView} shape for the price so the write contract
 * matches the U1 read contract exactly — integer minor units + ISO currency (invariant #5), no float.
 * The row label rides the URL path (not the body), so {@link #toCommand(String)} folds it in;
 * {@link RowPriceCommand} does the range/token validation (bad input → {@link IllegalArgumentException}
 * → {@code 400 INVALID_REQUEST}, §6b). A non-numeric {@code minorUnits} never reaches here — Jackson
 * rejects the body first (framework {@code 400 INVALID_REQUEST}).
 *
 * <p>{@code expectedVersion} is the required optimistic-concurrency token (#226) — the {@code setVersion}
 * the tab loaded with the map read. It is typed {@link Long} (not primitive) so an absent field is
 * {@code null}, not a silent {@code 0}: {@link #requiredExpectedVersion()} rejects the null with a
 * {@code 400} rather than letting it match a fresh venue (mirrors {@code BeachMapLayoutRequest} /
 * {@code UpdateVenueProfileRequest}).
 */
record RowPriceRequest(MoneyView price, Long expectedVersion) {

	/** The loaded concurrency token, required — a missing {@code expectedVersion} is a 400, never a 0 (#226). */
	long requiredExpectedVersion() {
		if (expectedVersion == null) {
			throw new IllegalArgumentException("expectedVersion is required");
		}
		return expectedVersion;
	}

	RowPriceCommand toCommand(String rowLabel) {
		if (price == null) {
			throw new IllegalArgumentException("price is required");
		}
		return new RowPriceCommand(rowLabel, price.minorUnits(), price.currency());
	}
}
