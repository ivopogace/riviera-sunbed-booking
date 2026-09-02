package ai.riviera.platform.review.application;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import ai.riviera.platform.review.vocabulary.BookingRef;
import ai.riviera.platform.review.vocabulary.CompletedStay;
import ai.riviera.platform.review.vocabulary.ListedReview;
import ai.riviera.platform.review.vocabulary.OwnReview;
import ai.riviera.platform.review.vocabulary.VenueRef;

/**
 * The review store, as the use cases need it — the module's own driven port, implemented by its
 * {@code adapter/out} (so it stays here in {@code application}, not in {@code spi}, which is for
 * ports another module implements).
 */
public interface Reviews {

	/**
	 * Claim this stay's one review slot and record the verdict against it. Named for the
	 * availability primitive it mirrors, not for the write: the row's creation <em>is</em> the claim.
	 * The row keeps the stay's venue and service date from {@code stay}, so the public listing can
	 * name the month without asking {@code booking}.
	 *
	 * @param submission the verdict; a {@code null} comment means a star-only review
	 * @return {@code true} if this call recorded the review, {@code false} if the booking already had
	 *         one — the claim is atomic, so a lost race is an ordinary {@code false}, not an exception
	 */
	boolean claim(CompletedStay stay, ReviewSubmission submission, Instant at);

	/**
	 * Overwrite this booking's review in place, stamping {@code at} as its edit time.
	 *
	 * @return {@code false} when no row answered to the booking — a delete won the race
	 */
	boolean update(BookingRef booking, ReviewSubmission submission, Instant at);

	/**
	 * Remove this booking's review, freeing nothing: the slot stays claimable only in the sense that
	 * a fresh submit may re-take it.
	 *
	 * @return {@code false} when no row answered to the booking
	 */
	boolean delete(BookingRef booking);

	/** This booking's stored review, as its author reads it back — empty when there is none. */
	Optional<OwnReview> findFor(BookingRef booking);

	/** What this venue's review rows add up to right now — {@code 0/0} when it has none. */
	ReviewTotals totalsFor(VenueRef venue);

	/** Whether this booking's one review slot is already taken. */
	boolean existsFor(BookingRef booking);

	/**
	 * Up to {@code limit} of {@code venue}'s listed reviews — the ones carrying a comment — with an
	 * id below {@code beforeId}, newest first. The store answers rows; how many make a page and
	 * whether another follows is the service's arithmetic.
	 */
	List<ListedReview> newestListedBefore(VenueRef venue, long beforeId, int limit);
}
