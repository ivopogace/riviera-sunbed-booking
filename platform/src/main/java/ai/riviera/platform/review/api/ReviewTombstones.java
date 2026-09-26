package ai.riviera.platform.review.api;

import java.util.Collection;

import ai.riviera.platform.review.vocabulary.BookingRef;

/**
 * The erasure reach into reviews: strip the display name and the comment from every review of the
 * given bookings, leaving the star to keep counting. A review is attached to a booking, not a
 * person, so the caller ({@code booking}, for {@code customer}'s erasure and retention sweep) names
 * bookings and this module never learns who the subject was.
 *
 * <p>A scrub, never a delete: the one-per-booking slot stays taken and the aggregate whole.
 */
public interface ReviewTombstones {

	/**
	 * Blank the display name and comment of every review of {@code bookings}, hidden ones included,
	 * in the caller's transaction; stars, timestamps and moderation state are untouched.
	 *
	 * @return how many reviews changed — {@code 0} for an empty collection or already-stripped rows
	 */
	int tombstone(Collection<BookingRef> bookings);
}
