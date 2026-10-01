package ai.riviera.platform.payout.adapter.in;

import java.util.List;
import java.util.OptionalLong;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import ai.riviera.platform.ApiErrorHandler;
import ai.riviera.platform.payout.application.BatchStatusOutcome;
import ai.riviera.platform.payout.application.PayoutReport;
import ai.riviera.platform.payout.domain.BatchStatus;
import ai.riviera.platform.payout.domain.PayoutBatch;
import ai.riviera.platform.payout.domain.PeriodKey;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Wire contract of the payout batch admin endpoints — the module's first wire-level
 * error test: RFC-7807 ProblemDetail with a <em>stable</em> {@code code}. Pins two fixes over the
 * prior behavior: {@code ILLEGAL_TRANSITION} no longer embeds the from→to pair in the code (it
 * moves to {@code detail}), and a malformed period/status token maps to {@code INVALID_REQUEST}
 * instead of leaking {@code ex.getMessage()}. Standalone MockMvc + a stubbed {@link PayoutReport}
 * — status mapping only; the transition rules themselves are pinned by
 * {@code PayoutBatchLifecycleTest}, and security by {@code SecurityConfig}'s ITs.
 */
class AdminPayoutBatchControllerTest {

	private BatchStatusOutcome markOutcome;
	private OptionalLong markedWith;
	private MockMvc mvc;

	@BeforeEach
	void setUp() {
		PayoutReport stub = new PayoutReport() {
			@Override
			public List<PayoutBatch> generate(PeriodKey period) {
				return List.of();
			}

			@Override
			public List<PayoutBatch> forPeriod(PeriodKey period) {
				return List.of();
			}

			@Override
			public BatchStatusOutcome mark(long batchId, BatchStatus target, OptionalLong reviewedTotalNetMinor) {
				markedWith = reviewedTotalNetMinor;
				return markOutcome;
			}
		};
		mvc = MockMvcBuilders.standaloneSetup(new AdminPayoutBatchController(stub))
				.setControllerAdvice(new ApiErrorHandler())
				.build();
	}

	@Test
	void unknownBatchIs404WithStableCode() throws Exception {
		markOutcome = new BatchStatusOutcome.NotFound();
		mvc.perform(patch("/api/admin/payout-batches/99").contentType(MediaType.APPLICATION_JSON)
						.content("{\"status\":\"REPORTED\",\"expectedTotalNetMinor\":4000}"))
				.andExpect(status().isNotFound())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("NO_SUCH_BATCH"));
	}

	@Test
	void illegalTransitionIs409WithStableCodeAndDetail() throws Exception {
		markOutcome = new BatchStatusOutcome.IllegalTransition(BatchStatus.SETTLED, BatchStatus.DRAFT);
		mvc.perform(patch("/api/admin/payout-batches/7").contentType(MediaType.APPLICATION_JSON)
						.content("{\"status\":\"DRAFT\"}"))
				.andExpect(status().isConflict())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("ILLEGAL_TRANSITION"))
				.andExpect(jsonPath("$.detail").value("SETTLED to DRAFT is not a legal transition."));
	}

	@Test
	void malformedStatusTokenIs400InvalidRequest() throws Exception {
		mvc.perform(patch("/api/admin/payout-batches/7").contentType(MediaType.APPLICATION_JSON)
						.content("{\"status\":\"NONSENSE\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
				// This used to leak ex.getMessage() as the error value — must stay generic now.
				.andExpect(jsonPath("$.detail").value("Request validation failed."));
	}

	@Test
	void malformedPeriodIs400InvalidRequest() throws Exception {
		mvc.perform(post("/api/admin/payout-batches").param("period", "not-a-period"))
				.andExpect(status().isBadRequest())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void reportingWithoutTheReviewedTotalIs400AndMarksNothing() throws Exception {
		mvc.perform(patch("/api/admin/payout-batches/7").contentType(MediaType.APPLICATION_JSON)
						.content("{\"status\":\"REPORTED\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
		assertNull(markedWith, "the port is never called");
	}

	@Test
	void reportingPassesTheReviewedTotalThrough() throws Exception {
		PayoutBatch reported = new PayoutBatch(7L, new VenueId(3), PeriodKey.of("2026-W28"), -1250, "EUR",
				BatchStatus.REPORTED);
		markOutcome = new BatchStatusOutcome.Marked(reported);
		mvc.perform(patch("/api/admin/payout-batches/7").contentType(MediaType.APPLICATION_JSON)
						.content("{\"status\":\"REPORTED\",\"expectedTotalNetMinor\":-1250}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("REPORTED"))
				.andExpect(jsonPath("$.totalNetMinor").value(-1250));
		assertEquals(OptionalLong.of(-1250), markedWith);
	}

	@Test
	void aChangedTotalIs409TotalChanged() throws Exception {
		markOutcome = new BatchStatusOutcome.TotalChanged(new PayoutBatch(7L, new VenueId(3),
				PeriodKey.of("2026-W28"), 3500, "EUR", BatchStatus.DRAFT));
		mvc.perform(patch("/api/admin/payout-batches/7").contentType(MediaType.APPLICATION_JSON)
						.content("{\"status\":\"REPORTED\",\"expectedTotalNetMinor\":4000}"))
				.andExpect(status().isConflict())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("TOTAL_CHANGED"));
	}

	@Test
	void settlingNeedsNoReviewedTotal() throws Exception {
		markOutcome = new BatchStatusOutcome.Marked(new PayoutBatch(7L, new VenueId(3), PeriodKey.of("2026-W28"),
				4000, "EUR", BatchStatus.SETTLED));
		mvc.perform(patch("/api/admin/payout-batches/7").contentType(MediaType.APPLICATION_JSON)
						.content("{\"status\":\"SETTLED\"}"))
				.andExpect(status().isOk());
		assertEquals(OptionalLong.empty(), markedWith);
	}
}
