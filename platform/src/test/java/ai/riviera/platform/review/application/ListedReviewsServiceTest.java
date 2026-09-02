package ai.riviera.platform.review.application;

import java.time.Instant;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.review.api.ListedReviews;
import ai.riviera.platform.review.vocabulary.BookingRef;
import ai.riviera.platform.review.vocabulary.CompletedStay;
import ai.riviera.platform.review.vocabulary.ListedReview;
import ai.riviera.platform.review.vocabulary.OwnReview;
import ai.riviera.platform.review.vocabulary.ReviewCursor;
import ai.riviera.platform.review.vocabulary.ReviewPage;
import ai.riviera.platform.review.vocabulary.ReviewRef;
import ai.riviera.platform.review.vocabulary.VenueRef;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * The page arithmetic behind {@link ListedReviews}, against a fake store: a page is at most
 * {@link ListedReviewsService#PAGE_SIZE} rows, it carries a cursor exactly when the store had one more,
 * and the cursor it hands out bounds the next read. What the store lists (visible, commented) is
 * SQL and lives in {@code ReviewListingFlowIT}.
 */
class ListedReviewsServiceTest {

	private static final VenueRef VENUE = new VenueRef(3);

	private final FakeReviews reviews = new FakeReviews();
	private final ListedReviews service = new ListedReviewsService(reviews);

	@Test
	void aFullPageCarriesTheNextCursor() {
		reviews.stock(30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20);

		ReviewPage page = service.pageFor(VENUE, ReviewCursor.FIRST_PAGE);

		assertEquals(10, page.reviews().size());
		assertEquals(30L, page.reviews().getFirst().ref().value());
		assertEquals(21L, page.reviews().getLast().ref().value());
		assertEquals(Optional.of(new ReviewCursor(21)), page.next());
	}

	@Test
	void aShortPageCarriesNoCursor() {
		reviews.stock(3, 2, 1);

		ReviewPage page = service.pageFor(VENUE, ReviewCursor.FIRST_PAGE);

		assertEquals(3, page.reviews().size());
		assertEquals(Optional.empty(), page.next());
	}

	@Test
	void anExactlyFullPageCarriesNoCursor() {
		reviews.stock(10, 9, 8, 7, 6, 5, 4, 3, 2, 1);

		ReviewPage page = service.pageFor(VENUE, ReviewCursor.FIRST_PAGE);

		assertEquals(10, page.reviews().size());
		assertEquals(Optional.empty(), page.next());
	}

	@Test
	void anEmptyVenueAnswersAnEmptyPage() {
		assertEquals(new ReviewPage(List.of(), false), service.pageFor(VENUE, ReviewCursor.FIRST_PAGE));
	}

	@Test
	void theCursorBoundsTheNextRead() {
		reviews.stock(3, 2, 1);

		ReviewPage page = service.pageFor(VENUE, new ReviewCursor(2));

		assertEquals(2L, reviews.lastBefore);
		assertEquals(ListedReviewsService.PAGE_SIZE + 1, reviews.lastLimit);
		assertEquals(List.of(1L), page.reviews().stream().map(r -> r.ref().value()).toList());
	}

	@Test
	void theFirstPageIsUnbounded() {
		service.pageFor(VENUE, ReviewCursor.FIRST_PAGE);

		assertEquals(Long.MAX_VALUE, reviews.lastBefore);
	}

	/** A store answering the listing read from a stocked id list; the writes are never reached. */
	private static final class FakeReviews implements Reviews {

		private final List<Long> ids = new ArrayList<>();
		private long lastBefore;
		private int lastLimit;

		void stock(long... newestFirst) {
			for (long id : newestFirst) {
				ids.add(id);
			}
		}

		@Override
		public List<ListedReview> newestListedBefore(VenueRef venue, long beforeId, int limit) {
			lastBefore = beforeId;
			lastLimit = limit;
			return ids.stream().filter(id -> id < beforeId).limit(limit)
					.map(id -> new ListedReview(new ReviewRef(id), 4, "Guest " + id,
							YearMonth.of(2026, 7), "Comment " + id))
					.toList();
		}

		@Override
		public boolean claim(CompletedStay stay, ReviewSubmission submission, Instant at) {
			throw new UnsupportedOperationException("the listing read never writes");
		}

		@Override
		public boolean update(BookingRef booking, ReviewSubmission submission, Instant at) {
			throw new UnsupportedOperationException("the listing read never writes");
		}

		@Override
		public boolean delete(BookingRef booking) {
			throw new UnsupportedOperationException("the listing read never writes");
		}

		@Override
		public Optional<OwnReview> findFor(BookingRef booking) {
			throw new UnsupportedOperationException("the listing read never reads one review");
		}

		@Override
		public ReviewTotals totalsFor(VenueRef venue) {
			throw new UnsupportedOperationException("the listing read never aggregates");
		}

		@Override
		public boolean existsFor(BookingRef booking) {
			throw new UnsupportedOperationException("the listing read never reads one review");
		}
	}
}
