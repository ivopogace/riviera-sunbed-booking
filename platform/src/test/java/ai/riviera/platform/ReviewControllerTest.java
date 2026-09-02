package ai.riviera.platform;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.RequestBuilder;

import ai.riviera.platform.review.application.ReviewLifecycle;
import ai.riviera.platform.review.application.ReviewSubmission;
import ai.riviera.platform.review.vocabulary.AmendOutcome;
import ai.riviera.platform.review.vocabulary.SubmitOutcome;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The review endpoints' HTTP contract: every outcome arm's status + machine-readable {@code code},
 * the body validation (stars, and both text bounds — refused, never truncated), and — the one that
 * matters for invariant #7 — that the booking code in the path never reaches an error body, not
 * even through {@code instance}.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, WebSliceStubs.class})
class ReviewControllerTest {

	private static final String REVIEW = "/api/bookings/{code}/review";
	private static final String CODE = "RVWSECRET7";
	private static final ReviewSubmission SUBMISSION = new ReviewSubmission(4, "Great sunbeds", "Ana");

	@Autowired
	MockMvc mvc;

	@MockitoBean
	ReviewLifecycle reviewLifecycle;

	@Test
	void recordsFourStarsWithACommentAndADisplayName() throws Exception {
		when(reviewLifecycle.submit(any(), any())).thenReturn(new SubmitOutcome.Submitted());

		mvc.perform(submit(4))
				.andExpect(status().isCreated())
				.andExpect(content().string(""));

		verify(reviewLifecycle).submit(eq(CODE), eq(SUBMISSION));
	}

	@Test
	void unknownCodeIsTheSharedNonEnumeratingAnswer() throws Exception {
		when(reviewLifecycle.submit(any(), any())).thenReturn(new SubmitOutcome.NoSuchStay());

		mvc.perform(submit(4))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NO_SUCH_BOOKING"))
				.andExpect(jsonPath("$.detail").value("No booking with this code."));
	}

	@Test
	void aStayThatWasNeverCheckedInIsAConflict() throws Exception {
		when(reviewLifecycle.submit(any(), any())).thenReturn(new SubmitOutcome.NotEligible());

		mvc.perform(submit(4))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("BOOKING_NOT_COMPLETED"));
	}

	@Test
	void aFrozenStayIsAConflict() throws Exception {
		when(reviewLifecycle.submit(any(), any())).thenReturn(new SubmitOutcome.WindowClosed());

		mvc.perform(submit(4))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("REVIEW_WINDOW_CLOSED"));
	}

	@Test
	void aHiddenReviewIsAConflict() throws Exception {
		when(reviewLifecycle.edit(any(), any())).thenReturn(new AmendOutcome.Hidden());
		when(reviewLifecycle.delete(any())).thenReturn(new AmendOutcome.Hidden());

		// Its own code: the class's shared one sits at the per-code rate budget for one test run.
		mvc.perform(put(REVIEW, "RVWHIDDEN7").with(csrf()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"stars\":4,\"comment\":\"Great sunbeds\",\"displayName\":\"Ana\"}"))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("REVIEW_HIDDEN"))
				.andExpect(jsonPath("$.instance").value("/api/bookings"));
		mvc.perform(delete(REVIEW, "RVWHIDDEN7").with(csrf()))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("REVIEW_HIDDEN"));
	}

	@Test
	void aSecondReviewIsAConflict() throws Exception {
		when(reviewLifecycle.submit(any(), any())).thenReturn(new SubmitOutcome.AlreadyReviewed());

		mvc.perform(submit(4))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("REVIEW_ALREADY_SUBMITTED"));
	}

	@Test
	void starsOutsideOneToFiveNeverReachTheUseCase() throws Exception {
		for (String body : new String[] {"{\"stars\":0,\"displayName\":\"Ana\"}",
				"{\"stars\":6,\"displayName\":\"Ana\"}", "{\"stars\":-1,\"displayName\":\"Ana\"}", "{}"}) {
			mvc.perform(write(body))
					.andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
		}
		verify(reviewLifecycle, never()).submit(any(), any());
	}

	@Test
	void commentOverTheBoundIsRefusedNotTruncated() throws Exception {
		mvc.perform(write("{\"stars\":4,\"comment\":\"" + "x".repeat(1001) + "\",\"displayName\":\"Ana\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

		verify(reviewLifecycle, never()).submit(any(), any());
	}

	@Test
	void aCommentAtTheBoundIsAccepted() throws Exception {
		when(reviewLifecycle.submit(any(), any())).thenReturn(new SubmitOutcome.Submitted());

		mvc.perform(write("{\"stars\":4,\"comment\":\"" + "x".repeat(1000) + "\",\"displayName\":\"Ana\"}"))
				.andExpect(status().isCreated());
	}

	@Test
	void aDisplayNameOverTheBoundIsRefused() throws Exception {
		mvc.perform(write("{\"stars\":4,\"displayName\":\"" + "y".repeat(61) + "\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

		verify(reviewLifecycle, never()).submit(any(), any());
	}

	@Test
	void aMissingOrBlankDisplayNameIsRefused() throws Exception {
		for (String body : new String[] {"{\"stars\":4}", "{\"stars\":4,\"displayName\":\"\"}",
				"{\"stars\":4,\"displayName\":\"   \"}", "{\"stars\":4,\"displayName\":null}"}) {
			mvc.perform(write(body))
					.andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
		}
		verify(reviewLifecycle, never()).submit(any(), any());
	}

	@Test
	void aBlankCommentReachesTheUseCaseAsNoComment() throws Exception {
		when(reviewLifecycle.submit(any(), any())).thenReturn(new SubmitOutcome.Submitted());

		mvc.perform(write("{\"stars\":5,\"comment\":\"   \",\"displayName\":\"  Ana  \"}"))
				.andExpect(status().isCreated());

		verify(reviewLifecycle).submit(eq(CODE), eq(new ReviewSubmission(5, null, "Ana")));
	}

	@Test
	void theBookingCodeNeverAppearsInAnErrorBody() throws Exception {
		when(reviewLifecycle.submit(any(), any())).thenReturn(new SubmitOutcome.AlreadyReviewed());

		String body = mvc.perform(submit(4)).andReturn().getResponse().getContentAsString();

		assertThat(body).doesNotContain(CODE);
		mvc.perform(submit(4)).andExpect(jsonPath("$.instance").value("/api/bookings"));
	}

	@Test
	void anEditIsNoContent() throws Exception {
		when(reviewLifecycle.edit(any(), any())).thenReturn(new AmendOutcome.Done());

		mvc.perform(edit())
				.andExpect(status().isNoContent())
				.andExpect(content().string(""));

		verify(reviewLifecycle).edit(eq(CODE), eq(SUBMISSION));
	}

	@Test
	void aDeleteIsNoContent() throws Exception {
		when(reviewLifecycle.delete(any())).thenReturn(new AmendOutcome.Done());

		mvc.perform(delete(REVIEW, CODE).with(csrf()))
				.andExpect(status().isNoContent())
				.andExpect(content().string(""));

		verify(reviewLifecycle).delete(eq(CODE));
	}

	@Test
	void amendingAStayWithNoReviewIsItsOwnNotFound() throws Exception {
		when(reviewLifecycle.edit(any(), any())).thenReturn(new AmendOutcome.NoSuchReview());
		when(reviewLifecycle.delete(any())).thenReturn(new AmendOutcome.NoSuchReview());

		mvc.perform(edit())
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NO_SUCH_REVIEW"));
		mvc.perform(delete(REVIEW, CODE).with(csrf()))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NO_SUCH_REVIEW"));
	}

	@Test
	void amendingAnUnknownCodeIsTheSharedNonEnumeratingAnswer() throws Exception {
		when(reviewLifecycle.edit(any(), any())).thenReturn(new AmendOutcome.NoSuchStay());

		mvc.perform(edit())
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NO_SUCH_BOOKING"));
	}

	@Test
	void amendingANeverCheckedInStayIsAConflict() throws Exception {
		when(reviewLifecycle.delete(any())).thenReturn(new AmendOutcome.NotEligible());

		mvc.perform(delete(REVIEW, CODE).with(csrf()))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("BOOKING_NOT_COMPLETED"));
	}

	@Test
	void amendingAFrozenStayIsAConflict() throws Exception {
		when(reviewLifecycle.edit(any(), any())).thenReturn(new AmendOutcome.WindowClosed());

		mvc.perform(edit())
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("REVIEW_WINDOW_CLOSED"));
	}

	@Test
	void anEditIsBoundedTheSameWayASubmitIs() throws Exception {
		mvc.perform(put(REVIEW, CODE).with(csrf()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"stars\":4,\"comment\":\"" + "x".repeat(1001) + "\",\"displayName\":\"Ana\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

		verify(reviewLifecycle, never()).edit(any(), any());
	}

	@Test
	void theBookingCodeNeverAppearsInAnAmendErrorBody() throws Exception {
		when(reviewLifecycle.edit(any(), any())).thenReturn(new AmendOutcome.WindowClosed());
		when(reviewLifecycle.delete(any())).thenReturn(new AmendOutcome.NoSuchReview());

		assertThat(mvc.perform(edit()).andReturn().getResponse().getContentAsString())
				.doesNotContain(CODE);
		assertThat(mvc.perform(delete(REVIEW, CODE).with(csrf())).andReturn().getResponse()
				.getContentAsString()).doesNotContain(CODE);
		mvc.perform(edit()).andExpect(jsonPath("$.instance").value("/api/bookings"));
	}

	private static RequestBuilder edit() {
		return put(REVIEW, CODE).with(csrf()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"stars\":4,\"comment\":\"Great sunbeds\",\"displayName\":\"Ana\"}");
	}

	private static RequestBuilder submit(int stars) {
		return write("{\"stars\":" + stars + ",\"comment\":\"Great sunbeds\",\"displayName\":\"Ana\"}");
	}

	private static RequestBuilder write(String body) {
		return post(REVIEW, CODE).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body);
	}
}
