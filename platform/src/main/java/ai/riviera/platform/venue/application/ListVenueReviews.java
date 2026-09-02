package ai.riviera.platform.venue.application;

import java.util.Optional;

import ai.riviera.platform.review.vocabulary.ReviewCursor;
import ai.riviera.platform.review.vocabulary.ReviewPage;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The public review list on a venue's page — {@code review}'s page of listed reviews, served only
 * for a venue tourists may see. Internal driving port: its one caller is this module's tourist
 * read adapter.
 */
public interface ListVenueReviews {

	/**
	 * The page of {@code venue}'s listed reviews starting at {@code from}, or empty when the venue is
	 * not visible to tourists — which includes a venue that does not exist, so a caller cannot tell
	 * the two apart (the map read's answer).
	 */
	Optional<ReviewPage> pageFor(VenueId venue, ReviewCursor from);
}
