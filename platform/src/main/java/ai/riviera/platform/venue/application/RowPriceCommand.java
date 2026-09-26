package ai.riviera.platform.venue.application;

/**
 * The validated intent to reprice one beach-map <strong>row</strong> (O4) — the full-day price
 * applied to <em>every</em> set that carries {@code rowLabel} on the venue's map, fanned out by one
 * non-destructive {@code UPDATE} in {@link Venues#repriceRow}.
 *
 * <p>The compact constructor rejects a malformed reprice at the boundary
 * ({@link IllegalArgumentException} → {@code 400 INVALID_REQUEST}, §6b), not as a raw V2 CHECK
 * violation: {@code rowLabel} required, {@code priceMinor} integer minor units + ISO-4217 (#5).
 */
public record RowPriceCommand(String rowLabel, long priceMinor, String priceCurrency) {

	public RowPriceCommand {
		rowLabel = VenueFieldValidation.strip(rowLabel);
		VenueFieldValidation.requireText(rowLabel, "rowLabel");
		VenueFieldValidation.requireNonNegativeMinor(priceMinor, "priceMinor");
		VenueFieldValidation.requireIsoCurrency(priceCurrency, "priceCurrency");
	}
}
