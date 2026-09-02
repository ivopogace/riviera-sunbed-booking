package ai.riviera.platform;

import java.time.YearMonth;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.review.vocabulary.ListedReview;
import ai.riviera.platform.review.vocabulary.ReviewCursor;
import ai.riviera.platform.review.vocabulary.ReviewPage;
import ai.riviera.platform.review.vocabulary.ReviewRef;
import ai.riviera.platform.venue.application.ListVenueReviews;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * HTTP contract for the public venue review list through the real filter chain — what a test of
 * the venue service cannot prove: the wire shape (the stay as a year-month and nothing finer, the
 * cursor as the last review's id), a cursor that cannot name a review is refused before the port is
 * asked, an invisible venue is a {@code 404}, and the path is public <em>without</em> loosening the
 * operator-only reads beside it.
 *
 * <p>Lives in the root test package because the web slice imports the package-private edge config
 * ({@code SecurityConfig} / {@code WebCorsConfig} / {@link WebSliceStubs}), like every other
 * web-slice test here.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, WebSliceStubs.class})
class VenueReviewsControllerTest {

	private static final String REVIEWS = "/api/venues/{id}/reviews";
	private static final long VENUE = 7L;

	@Autowired
	MockMvc mvc;

	/** Replaces the inert {@link WebSliceStubs} bean so this test can drive the payload. */
	@MockitoBean
	ListVenueReviews reviews;

	@Test
	void servesTheStayAsYearMonthOnly() throws Exception {
		when(reviews.pageFor(new VenueId(VENUE), ReviewCursor.FIRST_PAGE)).thenReturn(Optional.of(
				new ReviewPage(List.of(listed(41, "Ana", "Great sunbeds")), false)));

		mvc.perform(get(REVIEWS, VENUE))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.reviews.length()").value(1))
				.andExpect(jsonPath("$.reviews[0].id").value(41))
				.andExpect(jsonPath("$.reviews[0].stars").value(4))
				.andExpect(jsonPath("$.reviews[0].displayName").value("Ana"))
				.andExpect(jsonPath("$.reviews[0].stayedIn").value("2026-07"))
				.andExpect(jsonPath("$.reviews[0].comment").value("Great sunbeds"))
				.andExpect(jsonPath("$.reviews[0].stayDate").doesNotExist())
				.andExpect(jsonPath("$.nextCursor").value(nullValue()));
	}

	@Test
	void aFullPageCarriesTheNextCursorOnTheWire() throws Exception {
		when(reviews.pageFor(new VenueId(VENUE), ReviewCursor.FIRST_PAGE)).thenReturn(Optional.of(
				new ReviewPage(List.of(listed(50, "Ana", "First"), listed(49, "Ben", "Second")), true)));

		mvc.perform(get(REVIEWS, VENUE))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.reviews.length()").value(2))
				.andExpect(jsonPath("$.nextCursor").value(49));
	}

	@Test
	void theCursorReachesThePortAsAReviewCursor() throws Exception {
		when(reviews.pageFor(new VenueId(VENUE), new ReviewCursor(49)))
				.thenReturn(Optional.of(new ReviewPage(List.of(), false)));

		mvc.perform(get(REVIEWS, VENUE).param("cursor", "49"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.reviews.length()").value(0))
				.andExpect(jsonPath("$.nextCursor").value(nullValue()));

		verify(reviews).pageFor(new VenueId(VENUE), new ReviewCursor(49));
	}

	@Test
	void rejectsANonPositiveCursor() throws Exception {
		mvc.perform(get(REVIEWS, VENUE).param("cursor", "0"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

		verify(reviews, never()).pageFor(any(), any());
	}

	@Test
	void rejectsAMalformedCursor() throws Exception {
		mvc.perform(get(REVIEWS, VENUE).param("cursor", "newest"))
				.andExpect(status().isBadRequest());

		verify(reviews, never()).pageFor(any(), any());
	}

	@Test
	void anInvisibleVenueIs404() throws Exception {
		when(reviews.pageFor(any(), any())).thenReturn(Optional.empty());

		mvc.perform(get(REVIEWS, VENUE)).andExpect(status().isNotFound());
	}

	@Test
	void isPublicAndDoesNotUngateTheOperatorRead() throws Exception {
		when(reviews.pageFor(any(), any())).thenReturn(Optional.of(new ReviewPage(List.of(), false)));

		mvc.perform(get(REVIEWS, VENUE)).andExpect(status().isOk());

		// One segment away and operator-only: the tourist path must not have widened the matcher.
		mvc.perform(get("/api/venues/{id}/availability", VENUE).param("date", "2027-02-01"))
				.andExpect(status().isUnauthorized());
	}

	private static ListedReview listed(long id, String displayName, String comment) {
		return new ListedReview(new ReviewRef(id), 4, displayName, YearMonth.of(2026, 7), comment);
	}
}
