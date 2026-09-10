package ai.riviera.platform.payout.application;

/**
 * What a venue is charged for one refund its own change caused, in integer minor units of the
 * collection currency (invariant #5). The configured amount as the application layer sees it — a
 * plain value, so nothing inside the hexagon binds to Spring's property machinery.
 *
 * <p>Charged as a {@code FEE} ledger entry, which every payout sum deducts (invariant #9).
 */
public record VenueChangeFee(long minorUnits) {

	public VenueChangeFee {
		if (minorUnits < 0) {
			throw new IllegalArgumentException("a venue-change fee is a positive magnitude (minor units)");
		}
	}
}
