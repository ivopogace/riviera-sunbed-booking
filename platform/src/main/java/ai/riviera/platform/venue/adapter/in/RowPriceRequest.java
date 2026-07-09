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
 */
record RowPriceRequest(MoneyView price) {

	RowPriceCommand toCommand(String rowLabel) {
		if (price == null) {
			throw new IllegalArgumentException("price is required");
		}
		return new RowPriceCommand(rowLabel, price.minorUnits(), price.currency());
	}
}
