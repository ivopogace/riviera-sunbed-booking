package ai.riviera.platform.venue.application;

import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The venue-side write of a venue's stored rating aggregate — {@code venue} remains the only writer
 * of its own table, so the numbers {@code review} computes land through here and nowhere else.
 * Rationale: RESPONSIBILITIES.md §venue.
 */
public interface VenueRatings {

	/**
	 * Take the venue row's write lock so two recomputes of one venue serialize (else stale totals can
	 * commit last and pin an old score). Call inside a transaction (the adapter throws otherwise) and
	 * before reading the totals; the weakest self-conflicting lock, so FK inserts are not blocked.
	 */
	void lockForRecompute(VenueId venue);

	/** Overwrite the venue's stored aggregate. A full replacement, never an increment. */
	void store(VenueId venue, int ratingTenths, int reviewsCount);
}
