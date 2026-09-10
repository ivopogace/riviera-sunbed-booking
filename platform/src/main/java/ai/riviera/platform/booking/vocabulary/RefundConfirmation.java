package ai.riviera.platform.booking.vocabulary;

/**
 * What the operator typed to authorise a remodel commit that refunds guests: how many refunds they
 * saw on the preview, and why they are remodelling. A commit that refunds nothing needs neither, and
 * carries {@link #NONE}. Published vocabulary (invariant #11): the edge parses it off the request
 * body and hands it to {@code booking}, which decides whether it matches the picture it re-derived
 * under lock — the count is a deliberate second act, not a field to default.
 *
 * <p>The reason is free text the receipt keeps verbatim; it is stripped and never blank once a
 * commit is confirmed.
 */
public record RefundConfirmation(int refundCount, String reason) {

	/** What a commit that refunds nothing carries. */
	public static final RefundConfirmation NONE = new RefundConfirmation(0, "");

	public RefundConfirmation {
		reason = reason == null ? "" : reason.strip();
	}
}
