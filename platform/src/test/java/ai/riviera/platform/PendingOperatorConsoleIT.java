package ai.riviera.platform;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import com.jayway.jsonpath.JsonPath;

import jakarta.servlet.http.Cookie;

import java.time.LocalDate;
import java.time.ZoneId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The PENDING-operator console proof: a freshly-registered operator signs in
 * <em>before approval</em>, creates a venue it owns (creator-owns-on-create), and every console
 * surface answers for it — while the venue stays invisible to tourists until an admin approves the
 * account, with no operator action in between. Runs the real edge (register → session login →
 * venue-scoped reads) over Testcontainers Postgres, so the may-authenticate set, the may-operate
 * ownership resolution, and the ACTIVE-only tourist fence are all exercised together.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=bootstrap-pw")
@AutoConfigureMockMvc
class PendingOperatorConsoleIT {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");
	private static final String USERNAME = "pend-console";
	private static final String PASSWORD = "pending-console-pw-1";
	private static final String VENUE_NAME = "Pending Console Venue";
	private static final String BOOTSTRAP_ADMIN = "operator";
	private static final String BOOTSTRAP_PASSWORD = "bootstrap-pw";

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;

	@BeforeEach
	void clean() {
		jdbc.sql("DELETE FROM operator_venue WHERE venue_id IN (SELECT id FROM venue WHERE name = :n)")
				.param("n", VENUE_NAME).update();
		jdbc.sql("DELETE FROM venue WHERE name = :n").param("n", VENUE_NAME).update();
		jdbc.sql("DELETE FROM operator WHERE username = :u").param("u", USERNAME).update();
	}

	@Test
	void aPendingOperatorCreatesAndWorksItsOwnVenue() throws Exception {
		Cookie session = registerAndSignIn();
		long venueId = createVenue(session);

		assertEquals("PENDING", jdbc.sql("SELECT status FROM operator WHERE username = :u")
				.param("u", USERNAME).query(String.class).single());

		mvc.perform(get("/api/venues/mine").cookie(session))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[?(@.id == %d)]".formatted(venueId)).exists());
		mvc.perform(get("/api/venues/{v}/profile", venueId).cookie(session))
				.andExpect(status().isOk());
		mvc.perform(get("/api/venues/{v}/availability", venueId).param("date", tomorrow()).cookie(session))
				.andExpect(status().isOk());
		mvc.perform(get("/api/venues/{v}/bookings", venueId).cookie(session))
				.andExpect(status().isOk());
		mvc.perform(get("/api/venues/{v}/takings", venueId).cookie(session))
				.andExpect(status().isOk());
		mvc.perform(get("/api/venues/{v}/booking-requests", venueId).cookie(session))
				.andExpect(status().isOk());
	}

	@Test
	void aPendingOperatorsVenueStaysHiddenFromTouristsUntilApproval() throws Exception {
		Cookie session = registerAndSignIn();
		long venueId = createVenue(session);

		// Anonymous tourist reads: absent from the list, 404 on the detail (never a partial view).
		mvc.perform(get("/api/venues/{v}", venueId)).andExpect(status().isNotFound());
		mvc.perform(get("/api/venues"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[?(@.id == %d)]".formatted(venueId)).doesNotExist());

		approve();

		// Approval alone flips the venue live — no operator action between.
		mvc.perform(get("/api/venues/{v}", venueId)).andExpect(status().isOk());
		mvc.perform(get("/api/venues"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[?(@.id == %d)]".formatted(venueId)).exists());
	}

	/** Register (a session-less 202, D-8) then sign in with the same credentials while PENDING. */
	private Cookie registerAndSignIn() throws Exception {
		mvc.perform(post("/api/auth/operator/register").with(csrf())
						.header(SessionLoginSupport.CHALLENGE_HEADER, SessionLoginSupport.solvedChallenge(mvc))
						.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"username": "%s", "password": "%s", "contactEmail": "pending@venue.example"}"""
								.formatted(USERNAME, PASSWORD)))
				.andExpect(status().isAccepted());
		return SessionLoginSupport.operatorSession(mvc, USERNAME, PASSWORD);
	}

	private long createVenue(Cookie session) throws Exception {
		MvcResult created = mvc.perform(post("/api/venues").cookie(session).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"name": "%s", "beach": "Test Beach", "region": "Test Region",
								 "bookingMode": "INSTANT", "payoutCurrency": "EUR"}""".formatted(VENUE_NAME)))
				.andExpect(status().isCreated())
				.andReturn();
		return ((Number) JsonPath.read(created.getResponse().getContentAsString(), "$.id")).longValue();
	}

	private void approve() throws Exception {
		long operatorId = jdbc.sql("SELECT id FROM operator WHERE username = :u")
				.param("u", USERNAME).query(Long.class).single();
		Cookie admin = SessionLoginSupport.operatorSession(mvc, BOOTSTRAP_ADMIN, BOOTSTRAP_PASSWORD);
		mvc.perform(post("/api/admin/operators/{id}/approve", operatorId).cookie(admin).with(csrf()))
				.andExpect(status().isNoContent());
	}

	private String tomorrow() {
		return LocalDate.now(TIRANE).plusDays(1).toString();
	}
}
