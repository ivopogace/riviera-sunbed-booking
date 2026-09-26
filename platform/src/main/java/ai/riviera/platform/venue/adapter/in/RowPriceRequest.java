package ai.riviera.platform.venue.adapter.in;

import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.application.RowPriceCommand;

/**
 * The {@code PUT /api/venues/{id}/rows/{rowLabel}/price} body. The price reuses the published
 * {@link MoneyView} shape: integer minor units + ISO currency, no float (invariant #5).
 * {@link #toCommand(String)} folds in the path's row label; {@link RowPriceCommand} validates, bad
 * input being an {@link IllegalArgumentException} → {@code 400 INVALID_REQUEST}. The required
 * {@code expectedVersion} ({@code setVersion}) is a {@link Long} so an absent field is null, never
 * a silent {@code 0} matching a fresh venue; {@link ExpectedVersion#require(Long)} rejects it.
 */
record RowPriceRequest(MoneyView price, Long expectedVersion) {

	RowPriceCommand toCommand(String rowLabel) {
		if (price == null) {
			throw new IllegalArgumentException("price is required");
		}
		return new RowPriceCommand(rowLabel, price.minorUnits(), price.currency());
	}
}
