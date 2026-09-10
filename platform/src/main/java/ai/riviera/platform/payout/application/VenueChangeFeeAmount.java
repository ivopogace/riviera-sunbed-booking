package ai.riviera.platform.payout.application;

/**
 * What a venue is charged for one refund its own change caused: the configured amount as the
 * application layer sees it — a plain value, so nothing inside the hexagon binds to Spring's
 * property machinery. Integer minor units + ISO currency (invariant #5).
 *
 * <p>Charged as a {@code FEE} ledger entry, which every payout sum deducts (invariant #9). A
 * positive magnitude: it deducts because of its entry type, never because its amount is signed.
 */
public record VenueChangeFeeAmount(long minorUnits, String currency) {

	public VenueChangeFeeAmount {
		if (minorUnits < 0) {
			throw new IllegalArgumentException("a venue-change fee is a positive magnitude (minor units)");
		}
		if (currency == null || currency.isBlank()) {
			throw new IllegalArgumentException("a venue-change fee needs its ISO currency");
		}
	}
}
