package ai.riviera.platform.venue.application;

import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The venue-side write of a venue's stored rating aggregate — {@code venue} remains the only writer
 * of its own table, so the numbers {@code review} computes land through here and nowhere else.
 */
public interface VenueRatings {

	/** Overwrite the venue's stored aggregate. A full replacement, never an increment. */
	void store(VenueId venue, int ratingTenths, int reviewsCount);
}
