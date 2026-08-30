package ai.riviera.platform;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.review.application.SubmitReview;
import ai.riviera.platform.review.vocabulary.SubmitOutcome;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The submit endpoint's HTTP contract: every {@link SubmitOutcome} arm's status + machine-readable
 * {@code code}, the 1..5 validation, and — the one that matters for invariant #7 — that the booking
 * code in the path never reaches the error body, not even through {@code instance}.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, WebSliceStubs.class})
class ReviewControllerTest {

	private static final String REVIEW = "/api/bookings/{code}/review";
	private static final String CODE = "RVWSECRET7";

	@Autowired
	MockMvc mvc;

	@MockitoBean
	SubmitReview submitReview;

	@Test
	void recordsFourStars() throws Exception {
		when(submitReview.submit(any(), anyStars())).thenReturn(new SubmitOutcome.Submitted());

		mvc.perform(stars(4))
				.andExpect(status().isCreated())
				.andExpect(content().string(""));

		verify(submitReview).submit(eq(CODE), eq(4));
	}

	@Test
	void unknownCodeIsTheSharedNonEnumeratingAnswer() throws Exception {
		when(submitReview.submit(any(), anyStars())).thenReturn(new SubmitOutcome.NoSuchStay());

		mvc.perform(stars(4))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NO_SUCH_BOOKING"))
				.andExpect(jsonPath("$.detail").value("No booking with this code."));
	}

	@Test
	void aStayThatWasNeverCheckedInIsAConflict() throws Exception {
		when(submitReview.submit(any(), anyStars())).thenReturn(new SubmitOutcome.NotEligible());

		mvc.perform(stars(4))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("BOOKING_NOT_COMPLETED"));
	}

	@Test
	void aFrozenStayIsAConflict() throws Exception {
		when(submitReview.submit(any(), anyStars())).thenReturn(new SubmitOutcome.WindowClosed());

		mvc.perform(stars(4))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("REVIEW_WINDOW_CLOSED"));
	}

	@Test
	void aSecondReviewIsAConflict() throws Exception {
		when(submitReview.submit(any(), anyStars())).thenReturn(new SubmitOutcome.AlreadyReviewed());

		mvc.perform(stars(4))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("REVIEW_ALREADY_SUBMITTED"));
	}

	@Test
	void starsOutsideOneToFiveNeverReachTheUseCase() throws Exception {
		for (String body : new String[] {"{\"stars\":0}", "{\"stars\":6}", "{\"stars\":-1}", "{}"}) {
			mvc.perform(post(REVIEW, CODE).with(csrf())
					.contentType(MediaType.APPLICATION_JSON).content(body))
					.andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
		}
		verify(submitReview, never()).submit(any(), anyStars());
	}

	@Test
	void theBookingCodeNeverAppearsInAnErrorBody() throws Exception {
		when(submitReview.submit(any(), anyStars())).thenReturn(new SubmitOutcome.AlreadyReviewed());

		String body = mvc.perform(stars(4)).andReturn().getResponse().getContentAsString();

		org.assertj.core.api.Assertions.assertThat(body).doesNotContain(CODE);
		mvc.perform(stars(4)).andExpect(jsonPath("$.instance").value("/api/bookings"));
	}

	private static org.springframework.test.web.servlet.RequestBuilder stars(int stars) {
		return post(REVIEW, CODE).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"stars\":" + stars + "}");
	}

	private static int anyStars() {
		return org.mockito.ArgumentMatchers.anyInt();
	}
}
