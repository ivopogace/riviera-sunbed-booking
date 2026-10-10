package ai.riviera.platform.venue.vocabulary;

/**
 * The set-price rule every venue price write obeys: integer minor units of at least
 * {@link #MIN_PRICE_MINOR} in {@link #CURRENCY}, the v1 collection currency (invariant #5). The V77
 * {@code set_position_price_check} and V76 {@code set_position_price_currency_check} CHECKs are its database
 * twin. A breach throws {@link IllegalArgumentException} ({@code 400 INVALID_REQUEST}) naming the field,
 * never the value. On the wire only the venue admin controller's set-write refusal carries the field (the
 * {@code field} extension, {@code price}); elsewhere the field is in the message alone.
 */
public final class SetPrice {

	public static final String CURRENCY = "EUR";

	/** €0.50: Stripe's minimum EUR charge; below it a PaymentIntent fails with {@code amount_too_small}. */
	public static final long MIN_PRICE_MINOR = 50;

	private SetPrice() {
	}

	public static void require(long priceMinor, String priceCurrency) {
		if (priceMinor < MIN_PRICE_MINOR) {
			throw new IllegalArgumentException("priceMinor must be at least " + MIN_PRICE_MINOR);
		}
		if (priceCurrency == null || priceCurrency.isBlank()) {
			throw new IllegalArgumentException("priceCurrency is required");
		}
		if (!CURRENCY.equals(priceCurrency)) {
			throw new IllegalArgumentException("priceCurrency must be " + CURRENCY);
		}
	}
}
