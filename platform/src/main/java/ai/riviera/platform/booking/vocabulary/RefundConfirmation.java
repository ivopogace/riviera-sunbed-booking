package ai.riviera.platform.booking.vocabulary;

/**
 * What the operator typed to authorise a remodel commit that refunds guests: how many refunds they
 * saw on the preview, and why they are remodelling. A commit that refunds nothing carries
 * {@link #NONE}. Published vocabulary (invariant #11): the edge parses it off the request body and
 * {@code booking} checks it against the picture re-derived under lock — the count is a deliberate
 * second act, never a field to default. The reason is kept verbatim on the receipt, stripped; a
 * confirmed commit's reason is never blank.
 */
public record RefundConfirmation(int refundCount, String reason) {

	/** What a commit that refunds nothing carries. */
	public static final RefundConfirmation NONE = new RefundConfirmation(0, "");

	public RefundConfirmation {
		reason = reason == null ? "" : reason.strip();
	}
}
