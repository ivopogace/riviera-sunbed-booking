package ai.riviera.platform.review.application;

import java.time.Clock;
import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

import ai.riviera.platform.review.events.ReviewsChanged;
import ai.riviera.platform.review.vocabulary.BookingRef;
import ai.riviera.platform.review.vocabulary.CompletedStay;
import ai.riviera.platform.review.vocabulary.ListedReview;
import ai.riviera.platform.review.vocabulary.ModerationOutcome;
import ai.riviera.platform.review.vocabulary.ReviewCursor;
import ai.riviera.platform.review.vocabulary.ReviewRef;
import ai.riviera.platform.review.vocabulary.VenueRef;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The moderation use cases in isolation: a takedown or its reversal announces the venue's aggregate
 * moved exactly when the row really changed, a repeat is an ordinary no-op rather than a second
 * event, and the admin list pages the way the public one does. The store is a fake; the conditional
 * update's row-count semantics are pinned for real by {@code ReviewModerationFlowIT}.
 */
class ReviewModerationServiceTest {

	private static final Instant NOW = Instant.parse("2026-08-01T09:00:00Z");
	private static final VenueRef VENUE = new VenueRef(3);
	private static final ReviewRef REVIEW = new ReviewRef(12);

	private final FakeReviews reviews = new FakeReviews();
	private final RecordingPublisher events = new RecordingPublisher();
	private final ReviewModeration service =
			new ReviewModerationService(reviews, events, Clock.fixed(NOW, ZoneOffset.UTC));

	@Test
	void hidePublishesOnceAndIsIdempotent() {
		reviews.stock(REVIEW, VENUE, null);

		assertEquals(new ModerationOutcome.Applied(), service.hide(REVIEW));
		assertEquals(new ModerationOutcome.AlreadyApplied(), service.hide(REVIEW));

		assertEquals(NOW, reviews.hiddenAt(REVIEW));
		assertEquals(List.of(new ReviewsChanged(VENUE)), events.published);
	}

	@Test
	void unhidePublishesOnceAndIsIdempotent() {
		reviews.stock(REVIEW, VENUE, NOW.minusSeconds(60));

		assertEquals(new ModerationOutcome.Applied(), service.unhide(REVIEW));
		assertEquals(new ModerationOutcome.AlreadyApplied(), service.unhide(REVIEW));

		assertNull(reviews.hiddenAt(REVIEW));
		assertEquals(List.of(new ReviewsChanged(VENUE)), events.published);
	}

	@Test
	void moderatingAnUnknownReviewIsNoSuchReview() {
		assertEquals(new ModerationOutcome.NoSuchReview(), service.hide(REVIEW));
		assertEquals(new ModerationOutcome.NoSuchReview(), service.unhide(REVIEW));

		assertTrue(events.published.isEmpty());
	}

	@Test
	void pagesTenAtATimeAndHandsOutTheOlderCursor() {
		for (long id = 11; id >= 1; id--) {
			reviews.stock(new ReviewRef(id), VENUE, id % 2 == 0 ? NOW : null);
		}

		ModerationPage first = service.pageFor(VENUE, ReviewCursor.FIRST_PAGE);
		ModerationPage second = service.pageFor(VENUE, first.next().orElseThrow());

		assertEquals(10, first.reviews().size());
		assertEquals(new ReviewRef(11), first.reviews().getFirst().ref());
		assertEquals(NOW, first.reviews().get(1).hiddenAt());
		assertEquals(new ReviewCursor(2), first.next().orElseThrow());
		assertEquals(List.of(new ReviewRef(1)), second.reviews().stream().map(ModeratedReview::ref).toList());
		assertFalse(second.hasMore());
	}

	/** An in-memory review table keyed by review id, holding only what moderation touches. */
	private static final class FakeReviews implements Reviews {

		private record Row(VenueRef venue, Instant hiddenAt) {
		}

		private final Map<ReviewRef, Row> rows = new LinkedHashMap<>();

		void stock(ReviewRef ref, VenueRef venue, Instant hiddenAt) {
			rows.put(ref, new Row(venue, hiddenAt));
		}

		Instant hiddenAt(ReviewRef ref) {
			return rows.get(ref).hiddenAt();
		}

		@Override
		public Optional<VenueRef> hide(ReviewRef review, Instant at) {
			Row row = rows.get(review);
			if (row == null || row.hiddenAt() != null) {
				return Optional.empty();
			}
			rows.put(review, new Row(row.venue(), at));
			return Optional.of(row.venue());
		}

		@Override
		public Optional<VenueRef> unhide(ReviewRef review) {
			Row row = rows.get(review);
			if (row == null || row.hiddenAt() == null) {
				return Optional.empty();
			}
			rows.put(review, new Row(row.venue(), null));
			return Optional.of(row.venue());
		}

		@Override
		public boolean existsById(ReviewRef review) {
			return rows.containsKey(review);
		}

		@Override
		public List<ModeratedReview> newestForModerationBefore(VenueRef venue, long beforeId, int limit) {
			return rows.entrySet().stream()
					.filter(e -> e.getValue().venue().equals(venue) && e.getKey().value() < beforeId)
					.sorted((a, b) -> Long.compare(b.getKey().value(), a.getKey().value()))
					.limit(limit)
					.map(e -> new ModeratedReview(e.getKey(), 4, "Guest", YearMonth.of(2026, 7),
							"Comment " + e.getKey().value(), NOW.minusSeconds(3600), e.getValue().hiddenAt()))
					.toList();
		}

		@Override
		public boolean claim(CompletedStay stay, ReviewSubmission submission, Instant at) {
			throw new UnsupportedOperationException("moderation never claims");
		}

		@Override
		public boolean update(BookingRef booking, ReviewSubmission submission, Instant at) {
			throw new UnsupportedOperationException("moderation never edits");
		}

		@Override
		public boolean delete(BookingRef booking) {
			throw new UnsupportedOperationException("moderation never deletes");
		}

		@Override
		public Optional<StoredReview> findFor(BookingRef booking) {
			throw new UnsupportedOperationException("moderation never reads by booking");
		}

		@Override
		public ReviewTotals totalsFor(VenueRef venue) {
			throw new UnsupportedOperationException("moderation never aggregates");
		}


		@Override
		public List<ListedReview> newestListedBefore(VenueRef venue, long beforeId, int limit) {
			throw new UnsupportedOperationException("moderation never lists for the public");
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
