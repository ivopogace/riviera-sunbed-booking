package ai.riviera.platform.review.application;

import ai.riviera.platform.review.domain.ReviewSlot;
import ai.riviera.platform.review.vocabulary.OwnReview;

/**
 * A review as the store holds it for one booking: what its author wrote, and whether an admin has
 * taken it out of public view. The author's read-back and the amend fences both need the second
 * fact, so it rides with the first rather than costing a second lookup.
 */
public record StoredReview(OwnReview review, boolean hidden) {

	/** The slot this row fills — the gate's word for it. */
	public ReviewSlot slot() {
		return hidden ? ReviewSlot.HIDDEN : ReviewSlot.TAKEN;
	}
}
