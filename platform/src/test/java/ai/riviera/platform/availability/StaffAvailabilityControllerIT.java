package ai.riviera.platform.availability;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * HTTP contract for the U8 staff mark/release endpoints (issue #10, AC-10): the operator gate
 * (writes require httpBasic role OPERATOR) and the outcome→status mapping (MARKED→200,
 * ALREADY_TAKEN→409, NO_SUCH_SET→404, DATE_IN_PAST→422, RELEASED→204). Testcontainers Postgres; the
 * operator password is set per-test so it never shadows {@code application.properties}.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=test-operator-pw")
@AutoConfigureMockMvc
class StaffAvailabilityControllerIT {

	private static final String OPERATOR = "operator";
	private static final String PASSWORD = "test-operator-pw";
	private static final long MIRAMAR = 1L;

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcClient jdbc;

	private long anyOnlineSet() {
		return jdbc.sql("SELECT id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1")
				.query(Long.class).single();
	}

	private static String dateBody(String date) {
		return "{\"date\":\"%s\"}".formatted(date);
	}

	private String markUrl(long setId) {
		return "/api/venues/" + MIRAMAR + "/sets/" + setId + "/availability";
	}

	@Test
	void writesRequireOperator() throws Exception {
		long set = anyOnlineSet();
		mvc.perform(post(markUrl(set)).contentType(MediaType.APPLICATION_JSON).content(dateBody("2032-07-01")))
				.andExpect(status().isUnauthorized());
		mvc.perform(delete(markUrl(set)).param("date", "2032-07-01"))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void markThenReleaseRoundTrips() throws Exception {
		long set = anyOnlineSet();
		String date = "2032-07-02";

		mvc.perform(post(markUrl(set)).with(httpBasic(OPERATOR, PASSWORD))
						.contentType(MediaType.APPLICATION_JSON).content(dateBody(date)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.state").value("STAFF_MARKED"));

		// A second mark on the now-taken (set, date) → 409.
		mvc.perform(post(markUrl(set)).with(httpBasic(OPERATOR, PASSWORD))
						.contentType(MediaType.APPLICATION_JSON).content(dateBody(date)))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error").value("ALREADY_TAKEN"));

		mvc.perform(delete(markUrl(set)).with(httpBasic(OPERATOR, PASSWORD)).param("date", date))
				.andExpect(status().isNoContent());

		// Releasing again → nothing staff-marked → 409 NOT_MARKED.
		mvc.perform(delete(markUrl(set)).with(httpBasic(OPERATOR, PASSWORD)).param("date", date))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error").value("NOT_MARKED"));
	}

	@Test
	void markingPastDateReturns422() throws Exception {
		mvc.perform(post(markUrl(anyOnlineSet())).with(httpBasic(OPERATOR, PASSWORD))
						.contentType(MediaType.APPLICATION_JSON).content(dateBody("2020-01-01")))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.error").value("DATE_IN_PAST"));
	}

	@Test
	void markingUnknownSetReturns404() throws Exception {
		mvc.perform(post(markUrl(999_999L)).with(httpBasic(OPERATOR, PASSWORD))
						.contentType(MediaType.APPLICATION_JSON).content(dateBody("2032-07-03")))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error").value("NO_SUCH_SET"));
	}

	@Test
	void markingWithMissingDateReturns400() throws Exception {
		mvc.perform(post(markUrl(anyOnlineSet())).with(httpBasic(OPERATOR, PASSWORD))
						.contentType(MediaType.APPLICATION_JSON).content("{}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error").value("INVALID_REQUEST"));
	}
}
