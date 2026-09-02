package ai.riviera.platform.review.api;

import java.util.Collection;

import ai.riviera.platform.review.vocabulary.BookingRef;

/**
 * The erasure reach into reviews: strip the personal data a review carries — the display name and
 * the comment — from every review of the given bookings, leaving the star to keep counting. A
 * review is attached to a booking, not a person, so the caller ({@code booking}, acting for the
 * {@code customer} module's erasure and retention sweep) names bookings and this module never
 * learns who the subject was.
 *
 * <p>Split from the other ports by consumer role: this is the one write surface the module
 * publishes, and it is a scrub, never a delete — the one-per-booking slot stays taken and the
 * aggregate stays whole. Idempotent: a row already stripped is not counted again.
 */
public interface ReviewTombstones {

	/**
	 * Blank the display name and delete the comment of every review of {@code bookings}, hidden ones
	 * included; stars, timestamps and moderation state are untouched. Runs in the caller's
	 * transaction. An empty collection changes nothing.
	 *
	 * @return how many reviews changed — {@code 0} when none of them still carried either value
	 */
	int tombstone(Collection<BookingRef> bookings);
}
