package ai.riviera.platform.venue.application;

import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The venue-side write of a venue's stored rating aggregate — {@code venue} remains the only writer
 * of its own table, so the numbers {@code review} computes land through here and nowhere else.
 */
public interface VenueRatings {

	/**
	 * Take the venue row's write lock for the calling transaction, so two recomputes of the same
	 * venue serialize instead of interleaving.
	 *
	 * <p>A recompute is a read (the review totals) followed by a write (this table), and a full
	 * re-read is only order-independent when those two are not interleaved: without the lock, a
	 * listener that read stale totals can commit after one that read fresh ones and pin the venue to
	 * the older score until some later review happens to fire another event.
	 *
	 * <p>Two preconditions, both of which the adapter enforces rather than assumes: it must run
	 * <strong>inside a transaction</strong> (outside one the lock is released as the statement
	 * returns, silently restoring the race — so that case throws), and it must be called
	 * <strong>before</strong> the totals are read, since locking afterwards leaves exactly the window
	 * it exists to close. The lock taken is deliberately the weakest that self-conflicts, so it
	 * serializes recomputes without blocking inserts that merely reference this venue.
	 */
	void lockForRecompute(VenueId venue);

	/** Overwrite the venue's stored aggregate. A full replacement, never an increment. */
	void store(VenueId venue, int ratingTenths, int reviewsCount);
}
