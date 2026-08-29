package ai.riviera.platform.review.application;

import java.time.Instant;

import ai.riviera.platform.review.vocabulary.BookingRef;
import ai.riviera.platform.review.vocabulary.VenueRef;

/**
 * The review store, as the use cases need it — the module's own driven port, implemented by its
 * {@code adapter/out} (so it stays here in {@code application}, not in {@code spi}, which is for
 * ports another module implements).
 */
public interface Reviews {

	/**
	 * Claim this booking's one review slot and record {@code stars} against it.
	 *
	 * @return {@code true} if this call recorded the review, {@code false} if the booking already had
	 *         one — the claim is atomic, so a lost race is an ordinary {@code false}, not an exception
	 */
	boolean record(BookingRef booking, VenueRef venue, int stars, Instant at);

	/** What this venue's review rows add up to right now — {@code 0/0} when it has none. */
	ReviewTotals totalsFor(VenueRef venue);

	/** Whether this booking's one review slot is already taken. */
	boolean existsFor(BookingRef booking);
}
