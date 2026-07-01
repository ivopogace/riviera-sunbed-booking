package ai.riviera.platform.venue.vocabulary;

/**
 * Money on the read API: integer minor units + ISO 4217 currency (invariant #5). Never a
 * floating-point amount. The frontend divides by 100 only for display.
 */
public record MoneyView(long minorUnits, String currency) {
}
