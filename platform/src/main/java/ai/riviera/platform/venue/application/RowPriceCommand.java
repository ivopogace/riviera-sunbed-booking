package ai.riviera.platform.venue.application;

import ai.riviera.platform.venue.vocabulary.SetPrice;

/**
 * The validated intent to reprice one beach-map <strong>row</strong> (O4) — the full-day price
 * applied to <em>every</em> set that carries {@code rowLabel} on the venue's map, fanned out by one
 * non-destructive {@code UPDATE} in {@link Venues#repriceRow}.
 *
 * <p>The compact constructor rejects a malformed reprice at the boundary
 * ({@link IllegalArgumentException} → {@code 400 INVALID_REQUEST}, §6b), not as a raw V76 CHECK
 * violation: {@code rowLabel} required, the price at least €0.50 in EUR ({@link SetPrice}, #5).
 */
public record RowPriceCommand(String rowLabel, long priceMinor, String priceCurrency) {

	public RowPriceCommand {
		rowLabel = VenueFieldValidation.strip(rowLabel);
		VenueFieldValidation.requireText(rowLabel, "rowLabel");
		SetPrice.require(priceMinor, priceCurrency);
	}
}
