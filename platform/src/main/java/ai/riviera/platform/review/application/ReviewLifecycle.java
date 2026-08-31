package ai.riviera.platform.review.application;

import ai.riviera.platform.review.vocabulary.AmendOutcome;
import ai.riviera.platform.review.vocabulary.SubmitOutcome;

/**
 * The code-holder managing their one review — the inbound port this module's own web adapter calls.
 * Internal to {@code review} (in {@code application}), not cross-module {@code api/}: its only
 * caller is this module's REST adapter (the {@code booking.ViewBooking} precedent).
 *
 * <p>Submit, edit and delete are one purposeful conversation held by one party, so they are one
 * port rather than three: the fences they share are applied in one place, and a caller learns the
 * whole surface at once.
 */
public interface ReviewLifecycle {

	/**
	 * Record a verdict against the stay behind {@code bookingCode}, or say why not.
	 *
	 * @param bookingCode the bearer credential the guest presents (invariant #7) — never logged
	 */
	SubmitOutcome submit(String bookingCode, ReviewSubmission submission);

	/**
	 * Rewrite the review already recorded against that stay, or say why not.
	 *
	 * @param bookingCode the bearer credential the guest presents (invariant #7) — never logged
	 */
	AmendOutcome edit(String bookingCode, ReviewSubmission submission);

	/**
	 * Remove the review already recorded against that stay, or say why not. The stay stays
	 * reviewable while its window is open, so a delete is not a final answer.
	 *
	 * @param bookingCode the bearer credential the guest presents (invariant #7) — never logged
	 */
	AmendOutcome delete(String bookingCode);
}
