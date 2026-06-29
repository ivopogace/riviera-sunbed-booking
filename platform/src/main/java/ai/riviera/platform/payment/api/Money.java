package ai.riviera.platform.payment.api;

/**
 * An amount to collect, in integer minor units + ISO 4217 currency (invariant #5 — never
 * {@code double}/{@code float}/{@code BigDecimal}-as-currency). v1 collection currency is
 * EUR. A value object passed across the {@code payment} seam.
 */
public record Money(long minor, String currency) {

	public Money {
		if (minor < 0) {
			throw new IllegalArgumentException("amount minor units must be >= 0");
		}
		if (currency == null || currency.isBlank()) {
			throw new IllegalArgumentException("currency is required");
		}
	}
}
