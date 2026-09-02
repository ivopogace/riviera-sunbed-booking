package ai.riviera.platform.review.application;

import ai.riviera.platform.review.vocabulary.ModerationOutcome;
import ai.riviera.platform.review.vocabulary.ReviewCursor;
import ai.riviera.platform.review.vocabulary.ReviewRef;
import ai.riviera.platform.review.vocabulary.VenueRef;

/**
 * A platform admin moderating reviews — the inbound port this module's own admin web adapter calls.
 * Internal to {@code review} (in {@code application}), not cross-module {@code api/}: its only
 * caller is this module's REST adapter (the {@link ReviewLifecycle} precedent).
 *
 * <p>Deliberately ownership-free: it answers for any venue and any review, because the caller is
 * the platform admin, admitted by role at the edge (invariant #13's admin exemption). A hide is a
 * reversible soft flag, never a delete — the review leaves the venue page and the score until it is
 * un-hidden. Both verbs announce {@link ai.riviera.platform.review.events.ReviewsChanged} when, and
 * only when, the row changed.
 */
public interface ReviewModeration {

	/** Every review of {@code venue} — hidden and star-only ones included — newest first, a page at a time. */
	ModerationPage pageFor(VenueRef venue, ReviewCursor from);

	/** Take the review out of public view, or say why not. */
	ModerationOutcome hide(ReviewRef review);

	/** Put a hidden review back into public view, or say why not. */
	ModerationOutcome unhide(ReviewRef review);
}
