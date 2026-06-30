package ai.riviera.platform.payout;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;

import org.springframework.http.MediaType;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * AC-8 (issue #12): the per-venue payout ledger read {@code GET /api/venues/{id}/payout-ledger} is
 * operator-gated venue financial data — an unauthenticated call is {@code 401}; with the operator
 * credential it returns the ledger (200). Gated BEFORE the public {@code GET /api/venues/**}.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=test-operator-pw")
@AutoConfigureMockMvc
class AdminPayoutSecurityIT {

	private static final String OPERATOR = "operator";
	private static final String PASSWORD = "test-operator-pw";
	private static final long MIRAMAR = 1L;

	@Autowired
	MockMvc mvc;

	@Test
	void ledgerReadRequiresOperator() throws Exception {
		mvc.perform(get("/api/venues/{id}/payout-ledger", MIRAMAR))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void operatorReadsTheLedger() throws Exception {
		mvc.perform(get("/api/venues/{id}/payout-ledger", MIRAMAR).with(httpBasic(OPERATOR, PASSWORD)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.venueId").value((int) MIRAMAR));
	}

	@Test
	void batchReportRequiresOperator() throws Exception {
		mvc.perform(get("/api/admin/payout-batches").param("period", "2099-W30"))
				.andExpect(status().isUnauthorized());
		mvc.perform(post("/api/admin/payout-batches").param("period", "2099-W30"))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void operatorReadsTheBatchReport() throws Exception {
		mvc.perform(get("/api/admin/payout-batches").param("period", "2099-W30")
						.with(httpBasic(OPERATOR, PASSWORD)))
				.andExpect(status().isOk());
	}

	@Test
	void batchStatusPatchRequiresOperator() throws Exception {
		// The PATCH item path is a distinct matcher (PAYOUT_BATCH_ITEM_PATH); it advances a batch toward
		// SETTLED, so it must also be operator-gated — unauthenticated is 401.
		mvc.perform(patch("/api/admin/payout-batches/{id}", 1L)
						.contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"REPORTED\"}"))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void malformedPeriodIsBadRequest() throws Exception {
		mvc.perform(get("/api/admin/payout-batches").param("period", "not-a-week")
						.with(httpBasic(OPERATOR, PASSWORD)))
				.andExpect(status().isBadRequest());
	}
}
