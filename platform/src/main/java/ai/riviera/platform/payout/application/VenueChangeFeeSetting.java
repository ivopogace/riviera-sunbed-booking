package ai.riviera.platform.payout.application;

/**
 * The platform's venue-change fee as stored state: what a venue is charged for one refund its own
 * change caused, and the write that changes it.
 *
 * <p>Read at charge time rather than held, so a change applies to every fee charged after it.
 * Posted {@code FEE} ledger rows are never repriced — the ledger is append-only and this port does
 * not touch it. The one window a live amount leaves open, and why it is accepted rather than closed
 * with an effective-dated schedule: {@code RESPONSIBILITIES.md} §{@code payout}, ADR-0021 §7.
 */
public interface VenueChangeFeeSetting {

	/** The fee in force now. Never null. */
	VenueChangeFeeAmount current();

	/** Put {@code minorUnits} in force; answers what is now stored. */
	VenueChangeFeeAmount change(long minorUnits);
}
