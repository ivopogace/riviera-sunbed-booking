package ai.riviera.platform.review.api;

import ai.riviera.platform.review.vocabulary.ReviewCursor;
import ai.riviera.platform.review.vocabulary.ReviewPage;
import ai.riviera.platform.review.vocabulary.VenueRef;

/**
 * A venue's reviews as tourists read them: the <em>listed</em> ones — visible, and carrying a
 * comment — newest first, a page at a time. A star-only review counts toward the venue's aggregate
 * ({@link VenueRatingSummary}) but is never listed; an empty page for a venue with a nonzero
 * aggregate is therefore ordinary, not an inconsistency.
 *
 * <p>Answers for any venue id: which venues a tourist may see at all is the caller's fence, not
 * this module's knowledge.
 */
public interface ListedReviews {

	/** The page of {@code venue}'s listed reviews starting at {@code from}, newest first. */
	ReviewPage pageFor(VenueRef venue, ReviewCursor from);
}
