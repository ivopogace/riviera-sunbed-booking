package ai.riviera.platform.booking.spi;

import ai.riviera.platform.booking.vocabulary.VenueChangeFee;

/**
 * What a venue is charged for one refund its own change caused — implemented by the {@code payout}
 * module, which owns the ledger the fee is posted to and therefore decides the amount.
 *
 * <p>Inverted rather than called directly: {@code payout} already depends on {@code booking::events}
 * and {@code booking::api}, so a {@code booking → payout} call would cycle (invariant #11). The
 * remodel preview quotes this rate before anything is committed; a commit snapshots the amount it
 * charged onto its receipt line, so a receipt is never re-priced by a later change to the rate.
 */
public interface VenueChangeFeeRate {

	/** The current fee per refunded booking. Never null. */
	VenueChangeFee perRefund();
}
