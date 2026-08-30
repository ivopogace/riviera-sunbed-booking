package ai.riviera.platform.review.application;

import ai.riviera.platform.review.vocabulary.SubmitOutcome;

/**
 * The rate-a-stay use case — the inbound port the module's own web adapter calls when a guest
 * submits their stars. Internal to {@code review} (in {@code application}), not cross-module
 * {@code api/}: its only caller is this module's REST adapter (the {@code booking.ViewBooking}
 * precedent).
 */
public interface SubmitReview {

	/**
	 * Record a {@code stars} verdict against the stay behind {@code bookingCode}, or say why not.
	 *
	 * @param bookingCode the bearer credential the guest presents (invariant #7) — never logged
	 * @param stars       1..5; the caller rejects anything else before reaching this port
	 */
	SubmitOutcome submit(String bookingCode, int stars);
}
