package ai.riviera.platform.venue.vocabulary;

/**
 * The set-price rule every venue price write obeys: positive integer minor units in {@link #CURRENCY},
 * the v1 collection currency (invariant #5). The V76 {@code set_position_price_check} and
 * {@code set_position_price_currency_check} CHECKs are its database twin. A breach throws
 * {@link IllegalArgumentException} ({@code 400 INVALID_REQUEST}) naming the field, never the value.
 */
public final class SetPrice {

	public static final String CURRENCY = "EUR";

	private SetPrice() {
	}

	public static void require(long priceMinor, String priceCurrency) {
		if (priceMinor <= 0) {
			throw new IllegalArgumentException("priceMinor must be > 0");
		}
		if (priceCurrency == null || priceCurrency.isBlank()) {
			throw new IllegalArgumentException("priceCurrency is required");
		}
		if (!CURRENCY.equals(priceCurrency)) {
			throw new IllegalArgumentException("priceCurrency must be " + CURRENCY);
		}
	}
}
