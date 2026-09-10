package ai.riviera.platform.booking.application.remodel;

/**
 * What a remodel commit did to a claim it could not move, as the receipt records it. Stored as the
 * {@code TEXT} token {@code remodel_receipt_outcome_kind_check} also lists (kept in lockstep).
 *
 * <ul>
 *   <li>{@link #REFUND} — a confirmed booking cancelled with reason {@code VENUE_CHANGE} and
 *       refunded in full.</li>
 *   <li>{@link #RELEASE} — an unpaid booking released; nothing was collected.</li>
 *   <li>{@link #DECLINE} — a pending request declined; nothing was collected.</li>
 * </ul>
 */
public enum ReceiptOutcomeKind {
	REFUND,
	RELEASE,
	DECLINE
}
