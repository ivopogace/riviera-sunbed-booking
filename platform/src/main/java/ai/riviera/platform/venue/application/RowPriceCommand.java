package ai.riviera.platform.venue.application;

/**
 * The validated intent to reprice one beach-map <strong>row</strong> (O4, issue #174) — the full-day
 * price applied to <em>every</em> set that carries {@code rowLabel} on the venue's map. The editing
 * grain is the row (design decision); the fan-out to the row's sets is a single non-destructive
 * {@code UPDATE} in {@link Venues#repriceRow}.
 *
 * <p>Its compact constructor enforces the same money invariant the V2 {@code price_minor >= 0} CHECK
 * enforces in the database: {@code priceMinor} is integer minor units + an ISO-4217 currency
 * (invariant #5, never a float), and {@code rowLabel} is required — so a malformed reprice is
 * rejected at the boundary ({@link IllegalArgumentException} → {@code 400 INVALID_REQUEST}, §6b)
 * rather than surfacing a raw constraint violation.
 */
public record RowPriceCommand(String rowLabel, long priceMinor, String priceCurrency) {

	public RowPriceCommand {
		rowLabel = VenueFieldValidation.strip(rowLabel);
		VenueFieldValidation.requireText(rowLabel, "rowLabel");
		VenueFieldValidation.requireNonNegativeMinor(priceMinor, "priceMinor");
		VenueFieldValidation.requireIsoCurrency(priceCurrency, "priceCurrency");
	}
}
