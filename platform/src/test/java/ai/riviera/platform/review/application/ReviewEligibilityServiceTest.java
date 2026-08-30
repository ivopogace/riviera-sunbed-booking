package ai.riviera.platform.review.application;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.review.api.ReviewEligibility;
import ai.riviera.platform.review.spi.CompletedStays;
import ai.riviera.platform.review.vocabulary.BookingRef;
import ai.riviera.platform.review.vocabulary.CompletedStay;
import ai.riviera.platform.review.vocabulary.ReviewState;
import ai.riviera.platform.review.vocabulary.VenueRef;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Every answer the code-gated view's {@code reviewable} flag is derived from, including the two the
 * happy path never reaches. The ordering matters as much as the values: this read and the submit
 * path fence in the same order, so a stay that trips two fences at once is told the same thing
 * whichever one answers it — {@code ReviewSubmitFlowIT} pins that agreement end to end.
 */
class ReviewEligibilityServiceTest {

	private static final Instant NOW = Instant.parse("2026-08-01T09:00:00Z");
	private static final String CODE = "RVWCODE123";
	private static final BookingRef BOOKING = new BookingRef(7);
	private static final VenueRef VENUE = new VenueRef(3);

	private final FakeCompletedStays stays = new FakeCompletedStays();
	private final FakeReviews reviews = new FakeReviews();
	private final ReviewEligibility eligibility =
			new ReviewEligibilityService(stays, reviews, Clock.fixed(NOW, ZoneOffset.UTC));

	@Test
	void aCheckedInUnratedStayInsideTheWindowIsEligible() {
		stays.completed(CODE, NOW.minus(Duration.ofDays(1)));

		assertEquals(ReviewState.ELIGIBLE, eligibility.stateFor(CODE));
	}

	@Test
	void aStayAlreadyRatedIsAlreadyReviewed() {
		stays.completed(CODE, NOW.minus(Duration.ofDays(1)));
		reviews.rated.add(BOOKING);

		assertEquals(ReviewState.ALREADY_REVIEWED, eligibility.stateFor(CODE));
	}

	@Test
	void aStayCheckedInBeyondTheWindowIsFrozen() {
		stays.completed(CODE, NOW.minus(Duration.ofDays(61)));

		assertEquals(ReviewState.WINDOW_CLOSED, eligibility.stateFor(CODE));
	}

	@Test
	void aStayThatIsBothRatedAndFrozenReadsAsFrozen() {
		// Submit fences the window first, so this read must not answer ALREADY_REVIEWED instead.
		stays.completed(CODE, NOW.minus(Duration.ofDays(61)));
		reviews.rated.add(BOOKING);

		assertEquals(ReviewState.WINDOW_CLOSED, eligibility.stateFor(CODE));
	}

	@Test
	void aBookingThatWasNeverCheckedInIsNotCompleted() {
		stays.knownButNotCompleted(CODE);

		assertEquals(ReviewState.NOT_COMPLETED, eligibility.stateFor(CODE));
	}

	@Test
	void aCodeNoBookingAnswersToIsNoSuchStay() {
		assertEquals(ReviewState.NO_SUCH_STAY, eligibility.stateFor(CODE));
	}

	private static final class FakeCompletedStays implements CompletedStays {

		private final Map<String, CompletedStay> completed = new HashMap<>();
		private final Set<String> known = new HashSet<>();

		void completed(String code, Instant completedAt) {
			completed.put(code, new CompletedStay(BOOKING, VENUE, completedAt));
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

		private final Set<BookingRef> rated = new HashSet<>();

		@Override
		public boolean claim(BookingRef booking, VenueRef venue, int stars, Instant at) {
			throw new UnsupportedOperationException("the eligibility read never writes");
		}

		@Override
		public ReviewTotals totalsFor(VenueRef venue) {
			throw new UnsupportedOperationException("the eligibility read never aggregates");
		}

		@Override
		public boolean existsFor(BookingRef booking) {
			return rated.contains(booking);
		}
	}
}
