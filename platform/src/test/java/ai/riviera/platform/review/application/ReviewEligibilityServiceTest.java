package ai.riviera.platform.review.application;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.review.api.ReviewEligibility;
import ai.riviera.platform.review.domain.ReviewWindow;
import ai.riviera.platform.review.spi.CompletedStays;
import ai.riviera.platform.review.vocabulary.BookingRef;
import ai.riviera.platform.review.vocabulary.CompletedStay;
import ai.riviera.platform.review.vocabulary.ListedReview;
import ai.riviera.platform.review.vocabulary.OwnReview;
import ai.riviera.platform.review.vocabulary.ReviewPanel;
import ai.riviera.platform.review.vocabulary.ReviewRef;
import ai.riviera.platform.review.vocabulary.VenueRef;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * One case per panel variant — including the two the enum this replaced could not tell apart: a
 * frozen verdict that is still worth reading back, and a window nobody ever wrote in.
 *
 * <p>The fence <em>order</em> is {@code ReviewGateTest}'s; what is pinned here is which panel each
 * verdict becomes and what it carries.
 */
class ReviewEligibilityServiceTest {

	private static final Instant NOW = Instant.parse("2026-08-01T09:00:00Z");
	private static final String CODE = "RVWCODE123";
	private static final BookingRef BOOKING = new BookingRef(7);
	private static final VenueRef VENUE = new VenueRef(3);
	private static final LocalDate STAYED_ON = LocalDate.of(2026, 7, 1);
	private static final Instant YESTERDAY = NOW.minus(Duration.ofDays(1));
	private static final Instant LONG_AGO = NOW.minus(Duration.ofDays(61));
	private static final OwnReview OWN = new OwnReview(4, "Great sunbeds", "Ana");

	private final FakeCompletedStays stays = new FakeCompletedStays();
	private final FakeReviews reviews = new FakeReviews();
	private final ReviewEligibility eligibility =
			new ReviewEligibilityService(stays, reviews, Clock.fixed(NOW, ZoneOffset.UTC));

	@Test
	void aCheckedInUnratedStayInsideTheWindowGetsTheForm() {
		stays.completed(CODE, YESTERDAY);

		assertEquals(new ReviewPanel.Eligible(ReviewWindow.closesAt(YESTERDAY)),
				eligibility.panelFor(CODE));
	}

	@Test
	void panelCarriesTheOwnReview() {
		stays.completed(CODE, YESTERDAY);
		reviews.stored.put(BOOKING, OWN);

		assertEquals(new ReviewPanel.AlreadyReviewed(OWN, ReviewWindow.closesAt(YESTERDAY)),
				eligibility.panelFor(CODE));
	}

	@Test
	void aRatedStayPastItsWindowIsFrozenAndStillReadable() {
		stays.completed(CODE, LONG_AGO);
		reviews.stored.put(BOOKING, OWN);

		assertEquals(new ReviewPanel.Frozen(OWN), eligibility.panelFor(CODE));
	}

	@Test
	void aHiddenReviewPanelsAsHidden() {
		stays.completed(CODE, LONG_AGO);
		reviews.stored.put(BOOKING, OWN);
		reviews.hidden.add(BOOKING);

		assertEquals(new ReviewPanel.Hidden(OWN), eligibility.panelFor(CODE));
	}

	@Test
	void anUnratedStayPastItsWindowIsSimplyClosed() {
		stays.completed(CODE, LONG_AGO);

		assertEquals(new ReviewPanel.WindowClosed(), eligibility.panelFor(CODE));
	}

	@Test
	void aBookingThatWasNeverCheckedInIsNotCompleted() {
		stays.knownButNotCompleted(CODE);

		assertEquals(new ReviewPanel.NotCompleted(), eligibility.panelFor(CODE));
	}

	@Test
	void aCodeNoBookingAnswersToIsNoSuchStay() {
		assertEquals(new ReviewPanel.NoSuchStay(), eligibility.panelFor(CODE));
	}

	private static final class FakeCompletedStays implements CompletedStays {

		private final Map<String, CompletedStay> completed = new HashMap<>();
		private final java.util.Set<String> known = new java.util.HashSet<>();

		void completed(String code, Instant completedAt) {
			completed.put(code, new CompletedStay(BOOKING, VENUE, STAYED_ON, completedAt));
			known.add(code);
		}

		void knownButNotCompleted(String code) {
			known.add(code);
		}

		@Override
		public Optional<CompletedStay> byCode(String bookingCode) {
			return Optional.ofNullable(completed.get(bookingCode));
		}

		@Override
		public boolean existsByCode(String bookingCode) {
			return known.contains(bookingCode);
		}
	}

	private static final class FakeReviews implements Reviews {

		private final Map<BookingRef, OwnReview> stored = new HashMap<>();
		private final Set<BookingRef> hidden = new HashSet<>();

		@Override
		public boolean claim(CompletedStay stay, ReviewSubmission submission, Instant at) {
			throw new UnsupportedOperationException("the eligibility read never writes");
		}

		@Override
		public boolean update(BookingRef booking, ReviewSubmission submission, Instant at) {
			throw new UnsupportedOperationException("the eligibility read never writes");
		}

		@Override
		public boolean delete(BookingRef booking) {
			throw new UnsupportedOperationException("the eligibility read never writes");
		}

		@Override
		public Optional<StoredReview> findFor(BookingRef booking) {
			return Optional.ofNullable(stored.get(booking))
					.map(review -> new StoredReview(review, hidden.contains(booking)));
		}

		@Override
		public ReviewTotals totalsFor(VenueRef venue) {
			throw new UnsupportedOperationException("the eligibility read never aggregates");
		}


		@Override
		public List<ListedReview> newestListedBefore(VenueRef venue, long beforeId, int limit) {
			throw new UnsupportedOperationException("the eligibility read never lists");
		}

		@Override
		public Optional<VenueRef> hide(ReviewRef review, Instant at) {
			throw new UnsupportedOperationException("the eligibility read never moderates");
		}

		@Override
		public Optional<VenueRef> unhide(ReviewRef review) {
			throw new UnsupportedOperationException("the eligibility read never moderates");
		}

		@Override
		public boolean existsById(ReviewRef review) {
			throw new UnsupportedOperationException("the eligibility read never moderates");
		}

		@Override
		public List<ModeratedReview> newestForModerationBefore(VenueRef venue, long beforeId, int limit) {
			throw new UnsupportedOperationException("the eligibility read never moderates");
		}
	}
}
