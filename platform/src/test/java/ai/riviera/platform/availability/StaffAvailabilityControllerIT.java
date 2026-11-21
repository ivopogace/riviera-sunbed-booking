package ai.riviera.platform.availability;

import java.time.Clock;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.OwnershipFixtures;
import ai.riviera.platform.SessionLoginSupport;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.TiraneDaytimeClock;
import ai.riviera.platform.booking.StayFixtures;

import jakarta.servlet.http.Cookie;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * HTTP contract for the staff mark/release endpoints (AC-10): the operator gate
 * (writes require an operator session cookie, role OPERATOR) and the outcome→status mapping (MARKED→200,
 * ALREADY_TAKEN→409, NO_SUCH_SET→404, DATE_IN_PAST→422, RELEASED→204). Testcontainers Postgres; each test
 * marks on a venue of its own that the bootstrap operator owns.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class StaffAvailabilityControllerIT {

	private static final String OPERATOR = "operator";
	private static final String PASSWORD = "test-operator-pw";

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	Clock clock;

	private Cookie operatorSession;

	private StayFixtures.Venue venue;

	@BeforeEach
	void logIn() throws Exception {
		operatorSession = SessionLoginSupport.operatorSession(mvc, OPERATOR, PASSWORD);
		venue = StayFixtures.venue(jdbc, "INSTANT", null, false);
		OwnershipFixtures.grantToBootstrap(jdbc, venue.id());
	}

	@AfterEach
	void removeVenue() {
		StayFixtures.cleanupNow(jdbc, venue.id());
	}

	private long anyOnlineSet() {
		return venue.online().getFirst().value();
	}

	/** A day the staff mark accepts whatever the hour: not before today in Europe/Tirane (#6). */
	private String aDayAhead() {
		return TiraneDaytimeClock.today(clock).plusDays(30).toString();
	}

	private static String dateBody(String date) {
		return "{\"date\":\"%s\"}".formatted(date);
	}

	private String markUrl(long setId) {
		return "/api/venues/" + venue.id() + "/sets/" + setId + "/availability";
	}

	@Test
	void writesRequireOperator() throws Exception {
		// A valid CSRF token is supplied so the rejection pins the auth gate (401 from the entry
		// point), not the CsrfFilter's 403.
		long set = anyOnlineSet();
		mvc.perform(post(markUrl(set)).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(dateBody(aDayAhead())))
				.andExpect(status().isUnauthorized());
		mvc.perform(delete(markUrl(set)).with(csrf()).param("date", aDayAhead()))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void markThenReleaseRoundTrips() throws Exception {
		long set = anyOnlineSet();
		String date = aDayAhead();

		mvc.perform(post(markUrl(set)).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(dateBody(date)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.state").value("STAFF_MARKED"));

		// A second mark on the now-taken (set, date) → 409.
		mvc.perform(post(markUrl(set)).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(dateBody(date)))
				.andExpect(status().isConflict())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("ALREADY_TAKEN"));

		mvc.perform(delete(markUrl(set)).cookie(operatorSession).with(csrf()).param("date", date))
				.andExpect(status().isNoContent());

		// Releasing again → nothing staff-marked → 409 NOT_MARKED.
		mvc.perform(delete(markUrl(set)).cookie(operatorSession).with(csrf()).param("date", date))
				.andExpect(status().isConflict())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("NOT_MARKED"));
	}

	@Test
	void markingPastDateReturns422() throws Exception {
		mvc.perform(post(markUrl(anyOnlineSet())).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(dateBody("2020-01-01")))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("DATE_IN_PAST"));
	}

	@Test
	void markingUnknownSetReturns404() throws Exception {
		mvc.perform(post(markUrl(999_999L)).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(dateBody(aDayAhead())))
				.andExpect(status().isNotFound())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("NO_SUCH_SET"));
	}

	@Test
	void markingWithMissingDateReturns400() throws Exception {
		mvc.perform(post(markUrl(anyOnlineSet())).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content("{}"))
				.andExpect(status().isBadRequest())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}
}
