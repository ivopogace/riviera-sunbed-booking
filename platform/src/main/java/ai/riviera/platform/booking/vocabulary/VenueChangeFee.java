package ai.riviera.platform.booking.vocabulary;

/**
 * What a venue is charged for one refund its own change caused: integer minor units + ISO currency
 * (invariant #5). Published so the remodel preview can quote it and the receipt can report what it
 * charged; the amount is decided by {@code payout} and reaches booking through
 * {@code booking.spi.VenueChangeFeeRate}.
 *
 * <p>A positive magnitude — it deducts because the ledger entry it becomes is a {@code FEE}, never
 * because its amount is signed (invariant #9).
 */
public record VenueChangeFee(long perRefundMinor, String currency) {

	public VenueChangeFee {
		if (perRefundMinor < 0) {
			throw new IllegalArgumentException("a venue-change fee is a positive magnitude (minor units)");
		}
		if (currency == null || currency.isBlank()) {
			throw new IllegalArgumentException("a venue-change fee needs its ISO currency");
		}
	}

	/** What {@code refundCount} refunded bookings cost the venue in total. */
	public long totalFor(int refundCount) {
		return perRefundMinor * refundCount;
	}
}
