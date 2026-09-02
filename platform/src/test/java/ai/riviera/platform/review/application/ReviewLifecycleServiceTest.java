package ai.riviera.platform.review.application;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

import ai.riviera.platform.review.events.ReviewsChanged;
import ai.riviera.platform.review.spi.CompletedStays;
import ai.riviera.platform.review.vocabulary.AmendOutcome;
import ai.riviera.platform.review.vocabulary.BookingRef;
import ai.riviera.platform.review.vocabulary.CompletedStay;
import ai.riviera.platform.review.vocabulary.OwnReview;
import ai.riviera.platform.review.vocabulary.SubmitOutcome;
import ai.riviera.platform.review.vocabulary.VenueRef;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The lifecycle use cases in isolation — what each verb writes and what it announces. The fences
 * themselves are {@code ReviewGateTest}'s; what is pinned here is that this service maps the gate's
 * verdict onto its own outcomes and publishes exactly when the aggregate really moved.
 *
 * <p>Both collaborators are fakes: {@link CompletedStays} is implemented by {@code booking} in
 * production, and the claim's row-count semantics are pinned for real by {@code ReviewUniquenessIT}.
 * The clock is frozen, so the window cases are exact.
 */
class ReviewLifecycleServiceTest {

	private static final Instant NOW = Instant.parse("2026-08-01T09:00:00Z");
	private static final String CODE = "RVWCODE123";
	private static final BookingRef BOOKING = new BookingRef(7);
	private static final VenueRef VENUE = new VenueRef(3);
	private static final LocalDate STAYED_ON = LocalDate.of(2026, 7, 1);
	private static final ReviewSubmission COMMENTED =
			new ReviewSubmission(4, "Great sunbeds", "Ana");

	private final FakeCompletedStays stays = new FakeCompletedStays();
	private final FakeReviews reviews = new FakeReviews();
	private final RecordingPublisher events = new RecordingPublisher();
	private final ReviewLifecycle service =
			new ReviewLifecycleService(stays, reviews, events, Clock.fixed(NOW, ZoneOffset.UTC));

	@Test
	void recordsCommentAndDisplayNameAndPublishes() {
		stays.completed(CODE, BOOKING, VENUE, NOW.minus(Duration.ofDays(1)));

		assertEquals(new SubmitOutcome.Submitted(), service.submit(CODE, COMMENTED));

		assertEquals(List.of(new Recorded(BOOKING, VENUE, new OwnReview(4, "Great sunbeds", "Ana"), NOW)),
				reviews.writes);
		assertEquals(List.of(new ReviewsChanged(VENUE)), events.published);
	}

	@Test
	void recordsAStarOnlyReviewWhenNoCommentWasWritten() {
		stays.completed(CODE, BOOKING, VENUE, NOW.minus(Duration.ofDays(1)));

		assertEquals(new SubmitOutcome.Submitted(), service.submit(CODE, new ReviewSubmission(5, null, "Ana")));

		assertEquals(new OwnReview(5, null, "Ana"), reviews.stored.get(BOOKING));
	}

	@Test
	void refusesAStayThatWasNeverCheckedIn() {
		stays.knownButNotCompleted(CODE);

		assertEquals(new SubmitOutcome.NotEligible(), service.submit(CODE, COMMENTED));

		assertTrue(reviews.writes.isEmpty());
		assertTrue(events.published.isEmpty());
	}

	@Test
	void refusesACodeNoBookingAnswersTo() {
		assertEquals(new SubmitOutcome.NoSuchStay(), service.submit(CODE, COMMENTED));

		assertTrue(reviews.writes.isEmpty());
		assertTrue(events.published.isEmpty());
	}

	@Test
	void refusesAfterSixtyDays() {
		stays.completed(CODE, BOOKING, VENUE, NOW.minus(Duration.ofDays(61)));

		assertEquals(new SubmitOutcome.WindowClosed(), service.submit(CODE, COMMENTED));

		assertTrue(reviews.writes.isEmpty());
		assertTrue(events.published.isEmpty());
	}

	@Test
	void answersAlreadyReviewedWhenTheClaimIsLost() {
		stays.completed(CODE, BOOKING, VENUE, NOW.minus(Duration.ofDays(1)));
		reviews.stored.put(BOOKING, new OwnReview(2, null, "Someone"));

		assertEquals(new SubmitOutcome.AlreadyReviewed(), service.submit(CODE, COMMENTED));

		assertTrue(events.published.isEmpty(), "a lost claim moved no aggregate");
	}

	@Test
	void refusesARatingOutsideTheScaleBeforeTouchingAnything() {
		stays.completed(CODE, BOOKING, VENUE, NOW.minus(Duration.ofDays(1)));

		for (int stars : new int[] {0, 6, -1}) {
			assertThrows(IllegalArgumentException.class,
					() -> service.submit(CODE, new ReviewSubmission(stars, null, "Ana")));
		}
		assertTrue(reviews.writes.isEmpty(), "an invalid rating must not reach the store");
	}

	@Test
	void editUpdatesAndRepublishes() {
		stays.completed(CODE, BOOKING, VENUE, NOW.minus(Duration.ofDays(1)));
		service.submit(CODE, new ReviewSubmission(2, null, "Ana"));
		events.published.clear();

		assertEquals(new AmendOutcome.Done(),
				service.edit(CODE, new ReviewSubmission(5, "Better than I said", "Ana K")));

		assertEquals(new OwnReview(5, "Better than I said", "Ana K"), reviews.stored.get(BOOKING));
		assertEquals(List.of(new ReviewsChanged(VENUE)), events.published);
	}

	@Test
	void editRefusesAfterTheWindow() {
		stays.completed(CODE, BOOKING, VENUE, NOW.minus(Duration.ofDays(1)));
		service.submit(CODE, new ReviewSubmission(2, null, "Ana"));
		stays.completed(CODE, BOOKING, VENUE, NOW.minus(Duration.ofDays(61)));
		events.published.clear();

		assertEquals(new AmendOutcome.WindowClosed(), service.edit(CODE, COMMENTED));

		assertEquals(new OwnReview(2, null, "Ana"), reviews.stored.get(BOOKING), "a frozen verdict stands");
		assertTrue(events.published.isEmpty());
	}

	@Test
	void editWithoutAReviewIsNoSuchReview() {
		stays.completed(CODE, BOOKING, VENUE, NOW.minus(Duration.ofDays(1)));

		assertEquals(new AmendOutcome.NoSuchReview(), service.edit(CODE, COMMENTED));

		assertTrue(events.published.isEmpty());
	}

	@Test
	void editRefusesAStayThatWasNeverCheckedIn() {
		stays.knownButNotCompleted(CODE);

		assertEquals(new AmendOutcome.NotEligible(), service.edit(CODE, COMMENTED));
	}

	@Test
	void editRefusesACodeNoBookingAnswersTo() {
		assertEquals(new AmendOutcome.NoSuchStay(), service.edit(CODE, COMMENTED));
	}

	@Test
	void editRefusesARatingOutsideTheScaleBeforeTouchingAnything() {
		stays.completed(CODE, BOOKING, VENUE, NOW.minus(Duration.ofDays(1)));
		service.submit(CODE, new ReviewSubmission(2, null, "Ana"));

		assertThrows(IllegalArgumentException.class,
				() -> service.edit(CODE, new ReviewSubmission(6, null, "Ana")));

		assertEquals(new OwnReview(2, null, "Ana"), reviews.stored.get(BOOKING));
	}

	@Test
	void deleteRepublishes() {
		stays.completed(CODE, BOOKING, VENUE, NOW.minus(Duration.ofDays(1)));
		service.submit(CODE, COMMENTED);
		events.published.clear();

		assertEquals(new AmendOutcome.Done(), service.delete(CODE));

		assertTrue(reviews.stored.isEmpty());
		assertEquals(List.of(new ReviewsChanged(VENUE)), events.published);
	}

	@Test
	void deleteRefusesAfterTheWindow() {
		stays.completed(CODE, BOOKING, VENUE, NOW.minus(Duration.ofDays(1)));
		service.submit(CODE, COMMENTED);
		stays.completed(CODE, BOOKING, VENUE, NOW.minus(Duration.ofDays(61)));
		events.published.clear();

		assertEquals(new AmendOutcome.WindowClosed(), service.delete(CODE));

		assertTrue(reviews.existsFor(BOOKING), "a frozen verdict stands");
		assertTrue(events.published.isEmpty());
	}

	@Test
	void deleteWithoutAReviewIsNoSuchReview() {
		stays.completed(CODE, BOOKING, VENUE, NOW.minus(Duration.ofDays(1)));

		assertEquals(new AmendOutcome.NoSuchReview(), service.delete(CODE));

		assertTrue(events.published.isEmpty());
	}

	@Test
	void deleteRefusesAStayThatWasNeverCheckedIn() {
		stays.knownButNotCompleted(CODE);

		assertEquals(new AmendOutcome.NotEligible(), service.delete(CODE));
	}

	@Test
	void deleteRefusesACodeNoBookingAnswersTo() {
		assertEquals(new AmendOutcome.NoSuchStay(), service.delete(CODE));
	}

	@Test
	void aDeletedReviewLeavesTheStayReviewableAgain() {
		stays.completed(CODE, BOOKING, VENUE, NOW.minus(Duration.ofDays(1)));
		service.submit(CODE, COMMENTED);
		service.delete(CODE);

		assertEquals(new SubmitOutcome.Submitted(), service.submit(CODE, new ReviewSubmission(1, null, "Ana")));
	}

	private record Recorded(BookingRef booking, VenueRef venue, OwnReview review, Instant at) {
	}

	private static final class FakeCompletedStays implements CompletedStays {

		private final Map<String, CompletedStay> completed = new HashMap<>();
		private final Set<String> known = new HashSet<>();

		void completed(String code, BookingRef booking, VenueRef venue, Instant completedAt) {
			completed.put(code, new CompletedStay(booking, venue, STAYED_ON, completedAt));
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

	/** An in-memory review table: what is stored, plus the write log the publish assertions read. */
	private static final class FakeReviews implements Reviews {

		private final Map<BookingRef, OwnReview> stored = new LinkedHashMap<>();
		private final List<Recorded> writes = new ArrayList<>();

		@Override
		public boolean claim(CompletedStay stay, ReviewSubmission submission, Instant at) {
			OwnReview review = asStored(submission);
			if (stored.putIfAbsent(stay.booking(), review) != null) {
				return false;
			}
			writes.add(new Recorded(stay.booking(), stay.venue(), review, at));
			return true;
		}

		@Override
		public boolean update(BookingRef booking, ReviewSubmission submission, Instant at) {
			OwnReview review = asStored(submission);
			if (stored.replace(booking, review) == null) {
				return false;
			}
			writes.add(new Recorded(booking, null, review, at));
			return true;
		}

		@Override
		public boolean delete(BookingRef booking) {
			return stored.remove(booking) != null;
		}

		@Override
		public Optional<OwnReview> findFor(BookingRef booking) {
			return Optional.ofNullable(stored.get(booking));
		}

		@Override
		public ReviewTotals totalsFor(VenueRef venue) {
			throw new UnsupportedOperationException("the lifecycle never aggregates");
		}

		@Override
		public boolean existsFor(BookingRef booking) {
			return stored.containsKey(booking);
		}

		private static OwnReview asStored(ReviewSubmission submission) {
			return new OwnReview(submission.stars(), submission.comment(), submission.displayName());
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
