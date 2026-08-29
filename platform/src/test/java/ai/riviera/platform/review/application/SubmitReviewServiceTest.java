package ai.riviera.platform.review.application;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

import ai.riviera.platform.review.events.ReviewsChanged;
import ai.riviera.platform.review.spi.CompletedStays;
import ai.riviera.platform.review.vocabulary.BookingRef;
import ai.riviera.platform.review.vocabulary.CompletedStay;
import ai.riviera.platform.review.vocabulary.SubmitOutcome;
import ai.riviera.platform.review.vocabulary.VenueRef;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The submit use case in isolation — the eligibility and window fences, the one-per-booking answer,
 * and the event that announces a moved aggregate (AC-1, AC-3, AC-4). Both collaborators are fakes:
 * {@link CompletedStays} is implemented by {@code booking} in production, and the claim's row-count
 * semantics are pinned for real by {@code ReviewUniquenessIT}. The clock is frozen, so the window
 * cases are exact.
 */
class SubmitReviewServiceTest {

	private static final Instant NOW = Instant.parse("2026-08-01T09:00:00Z");
	private static final String CODE = "RVWCODE123";
	private static final BookingRef BOOKING = new BookingRef(7);
	private static final VenueRef VENUE = new VenueRef(3);

	private final FakeCompletedStays stays = new FakeCompletedStays();
	private final FakeReviews reviews = new FakeReviews();
	private final RecordingPublisher events = new RecordingPublisher();
	private final SubmitReview service =
			new SubmitReviewService(stays, reviews, events, Clock.fixed(NOW, ZoneOffset.UTC));

	@Test
	void recordsReviewAndPublishes() {
		stays.completed(CODE, BOOKING, VENUE, NOW.minus(Duration.ofDays(1)));

		assertEquals(new SubmitOutcome.Submitted(), service.submit(CODE, 4));

		assertEquals(List.of(new Recorded(BOOKING, VENUE, 4, NOW)), reviews.recorded);
		assertEquals(List.of(new ReviewsChanged(VENUE)), events.published);
	}

	@Test
	void refusesAStayThatWasNeverCheckedIn() {
		stays.knownButNotCompleted(CODE);

		assertEquals(new SubmitOutcome.NotEligible(), service.submit(CODE, 4));

		assertTrue(reviews.recorded.isEmpty());
		assertTrue(events.published.isEmpty());
	}

	@Test
	void refusesACodeNoBookingAnswersTo() {
		assertEquals(new SubmitOutcome.NoSuchStay(), service.submit(CODE, 4));

		assertTrue(reviews.recorded.isEmpty());
		assertTrue(events.published.isEmpty());
	}

	@Test
	void refusesAfterSixtyDays() {
		stays.completed(CODE, BOOKING, VENUE, NOW.minus(Duration.ofDays(61)));

		assertEquals(new SubmitOutcome.WindowClosed(), service.submit(CODE, 4));

		assertTrue(reviews.recorded.isEmpty());
		assertTrue(events.published.isEmpty());
	}

	@Test
	void answersAlreadyReviewedWhenTheClaimIsLost() {
		stays.completed(CODE, BOOKING, VENUE, NOW.minus(Duration.ofDays(1)));
		reviews.alreadyHeld.add(BOOKING);

		assertEquals(new SubmitOutcome.AlreadyReviewed(), service.submit(CODE, 4));

		assertTrue(events.published.isEmpty(), "a lost claim moved no aggregate");
	}

	private record Recorded(BookingRef booking, VenueRef venue, int stars, Instant at) {
	}

	private static final class FakeCompletedStays implements CompletedStays {

		private final Map<String, CompletedStay> completed = new HashMap<>();
		private final Set<String> known = new HashSet<>();

		void completed(String code, BookingRef booking, VenueRef venue, Instant completedAt) {
			completed.put(code, new CompletedStay(booking, venue, completedAt));
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

		private final List<Recorded> recorded = new ArrayList<>();
		private final Set<BookingRef> alreadyHeld = new HashSet<>();

		@Override
		public boolean record(BookingRef booking, VenueRef venue, int stars, Instant at) {
			if (!alreadyHeld.add(booking)) {
				return false;
			}
			recorded.add(new Recorded(booking, venue, stars, at));
			return true;
		}

		@Override
		public ReviewTotals totalsFor(VenueRef venue) {
			throw new UnsupportedOperationException("the submit use case never aggregates");
		}
	}

	private static final class RecordingPublisher implements ApplicationEventPublisher {

		private final List<Object> published = new ArrayList<>();

		@Override
		public void publishEvent(Object event) {
			published.add(event);
		}
	}
}
