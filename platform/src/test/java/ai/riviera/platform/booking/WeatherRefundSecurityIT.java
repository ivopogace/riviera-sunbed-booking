package ai.riviera.platform.booking;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * AC-8 (issue #12): the admin weather refund {@code POST /api/venues/{id}/weather-refund} is
 * operator-gated — it moves real money (refunds + payout reversals), so an unauthenticated call is
 * {@code 401}; with the operator credential it succeeds (200) and returns the refund summary. The
 * authorized call uses a date with no confirmed bookings, so it is a safe 0-count no-op.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=test-operator-pw")
@AutoConfigureMockMvc
class WeatherRefundSecurityIT {

	private static final String OPERATOR = "operator";
	private static final String PASSWORD = "test-operator-pw";
	private static final long MIRAMAR = 1L;
	private static final LocalDate EMPTY_DAY = LocalDate.of(2019, 3, 3);

	@Autowired
	MockMvc mvc;

	@Test
	void weatherRefundRequiresOperator() throws Exception {
		mvc.perform(post("/api/venues/{id}/weather-refund", MIRAMAR).param("date", EMPTY_DAY.toString()))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void operatorGetsTheRefundSummary() throws Exception {
		mvc.perform(post("/api/venues/{id}/weather-refund", MIRAMAR)
						.with(httpBasic(OPERATOR, PASSWORD)).param("date", EMPTY_DAY.toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.refundedCount").value(0))
				.andExpect(jsonPath("$.totalRefundedMinor").value(0));
	}
}
