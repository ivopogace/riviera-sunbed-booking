package ai.riviera.platform.payout.adapter.in;

import java.util.List;

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

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Wire contract of the payout batch admin endpoints (issue #97) — the module's first wire-level
 * error test: RFC-7807 ProblemDetail with a <em>stable</em> {@code code}. Pins two fixes over the
 * pre-#97 behavior: {@code ILLEGAL_TRANSITION} no longer embeds the from→to pair in the code (it
 * moves to {@code detail}), and a malformed period/status token maps to {@code INVALID_REQUEST}
 * instead of leaking {@code ex.getMessage()}. Standalone MockMvc + a stubbed {@link PayoutReport}
 * — status mapping only; the transition rules themselves are pinned by
 * {@code PayoutBatchLifecycleTest}, and security by {@code SecurityConfig}'s ITs.
 */
class AdminPayoutBatchControllerTest {

	private BatchStatusOutcome markOutcome;
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
			public BatchStatusOutcome mark(long batchId, BatchStatus target) {
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
						.content("{\"status\":\"REPORTED\"}"))
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
				// Pre-#97 this leaked ex.getMessage() as the error value — must stay generic now.
				.andExpect(jsonPath("$.detail").value("Request validation failed."));
	}

	@Test
	void malformedPeriodIs400InvalidRequest() throws Exception {
		mvc.perform(post("/api/admin/payout-batches").param("period", "not-a-period"))
				.andExpect(status().isBadRequest())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}
}
