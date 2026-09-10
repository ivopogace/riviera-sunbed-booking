package ai.riviera.platform.payout.application;

/**
 * What a venue is charged for one refund its own change caused: the amount as the application layer
 * sees it — a plain value, so nothing inside the hexagon binds to Spring's property machinery.
 * Integer minor units + ISO currency (invariant #5).
 *
 * <p>Charged as a {@code FEE} ledger entry, which every payout sum deducts (invariant #9). A
 * positive magnitude: it deducts because of its entry type, never because its amount is signed.
 */
public record VenueChangeFeeAmount(long minorUnits, String currency) {

	/**
	 * The ceiling a stored fee may reach, mirrored by {@code platform_setting_amount_check} and by the
	 * console's own constant — keep the three in lockstep (ADR-0018 §3).
	 */
	public static final long MAX_FEE_MINOR = 100_000L;

	public VenueChangeFeeAmount {
		if (minorUnits < 0) {
			throw new IllegalArgumentException("a venue-change fee is a positive magnitude (minor units)");
		}
		if (minorUnits > MAX_FEE_MINOR) {
			throw new IllegalArgumentException("a venue-change fee must not exceed " + MAX_FEE_MINOR
					+ " minor units, but was " + minorUnits);
		}
		if (currency == null || currency.isBlank()) {
			throw new IllegalArgumentException("a venue-change fee needs its ISO currency");
		}
	}
}
