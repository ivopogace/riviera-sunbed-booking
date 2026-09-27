package ai.riviera.platform.booking;

import java.time.LocalDate;

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
import ai.riviera.platform.SessionLoginSupport;
import ai.riviera.platform.OwnershipFixtures;
import ai.riviera.platform.TestcontainersConfiguration;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * HTTP contract for creating a Request-to-Book booking (AC-1/AC-2): on a REQUEST-mode
 * venue, {@code POST /api/bookings} returns {@code 202} with {@code PENDING_REQUEST}, a response
 * deadline, and <strong>no</strong> payment credentials (payment-request-on-accept — no
 * PaymentIntent exists yet); the soft-held {@code (set, date)} then blocks the online channel
 * ({@code 409 SET_TAKEN}) and the staff walk-in channel (the {@code STAFF_MARKED} claim insert
 * is an {@code ON CONFLICT} no-op — the same single availability row, invariant #2).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class RequestToBookFlowIT {

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcClient jdbc;

	private long requestSet;

	@BeforeEach
	void seedRequestVenue() {
		long venueId = jdbc.sql("""
				INSERT INTO venue (name, beach, booking_mode, commission_bps, payout_currency)
				VALUES ('Request Flow Club', 'KSAMIL', 'REQUEST', 1500, 'EUR')
				RETURNING id
				""").query(Long.class).single();
		OwnershipFixtures.grantToBootstrap(jdbc, venueId);
		requestSet = jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:venue, 'A', 1, 'STANDARD', 'ONLINE', 4500, 'EUR', 1, 1)
				RETURNING id
				""").param("venue", venueId).query(Long.class).single();
	}

	private String body(long setId, LocalDate date) {
		return """
				{"setId": %d, "bookingDate": "%s",
				 "contact": {"email": "req@e.com", "fullName": "Request Guest", "phone": "+355699"}}
				""".formatted(setId, date);
	}

	private static LocalDate bookable() {
		return LocalDate.now().plusMonths(3);
	}

	@Test
	void pendingQueueIsOperatorGated() throws Exception {
		// SecurityConfig: the queue GET must be role-gated BEFORE the public venue GET —
		// an anonymous call is 401 (never a public read, never a 200). Accept/decline likewise.
		long venueId = jdbc.sql("SELECT venue_id FROM set_position WHERE id = :s")
				.param("s", requestSet).query(Long.class).single();
		mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
						.get("/api/venues/{v}/booking-requests", venueId))
				.andExpect(status().isUnauthorized());
		// The anonymous POSTs carry a valid CSRF token so the 401 pins the AUTH gate — without
		// one, CsrfFilter would answer first with 403 INVALID_CSRF_TOKEN.
		mvc.perform(post("/api/venues/{v}/booking-requests/{b}/accept", venueId, 1).with(csrf()))
				.andExpect(status().isUnauthorized());
		mvc.perform(post("/api/venues/{v}/booking-requests/{b}/decline", venueId, 1).with(csrf()))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void requestModeCreatesPendingRequestWithoutPaymentCredentials() throws Exception {
		mvc.perform(post("/api/bookings")
						.header(SessionLoginSupport.CHALLENGE_HEADER, SessionLoginSupport.solvedChallenge(mvc))
						.contentType(MediaType.APPLICATION_JSON)
						.content(body(requestSet, bookable())))
				.andExpect(status().isAccepted())
				.andExpect(jsonPath("$.status").value("PENDING_REQUEST"))
				.andExpect(jsonPath("$.code").isNotEmpty())
				.andExpect(jsonPath("$.requestExpiresAt").isNotEmpty())
				.andExpect(jsonPath("$.amount.minorUnits").value(4500))
				.andExpect(content().string(not(containsString("clientSecret"))));

		assertEquals(0L, jdbc.sql("SELECT count(*) FROM payment").query(Long.class).single(),
				"no PaymentIntent row for a pending request");
	}

	@Test
	void aPendingRequestLeavesTheDayOpenToOtherRequests() throws Exception {
		LocalDate date = bookable().plusDays(1);
		mvc.perform(post("/api/bookings")
						.header(SessionLoginSupport.CHALLENGE_HEADER, SessionLoginSupport.solvedChallenge(mvc))
						.contentType(MediaType.APPLICATION_JSON)
						.content(body(requestSet, date)))
				.andExpect(status().isAccepted());

		// ADR-0025: a request is not a hold — a second guest may request the same set and day.
		mvc.perform(post("/api/bookings")
						.header(SessionLoginSupport.CHALLENGE_HEADER, SessionLoginSupport.solvedChallenge(mvc))
						.contentType(MediaType.APPLICATION_JSON)
						.content(body(requestSet, date)))
				.andExpect(status().isAccepted())
				.andExpect(jsonPath("$.status").value("PENDING_REQUEST"));
		assertEquals(0L, jdbc.sql("SELECT count(*) FROM set_availability WHERE set_id = :set AND booking_date = :date")
				.param("set", requestSet).param("date", date).query(Long.class).single(),
				"neither request wrote an availability row");
	}

	@Test
	void aPendingRequestLeavesTheDayOpenToStaff() throws Exception {
		LocalDate date = bookable().plusDays(2);
		mvc.perform(post("/api/bookings")
						.header(SessionLoginSupport.CHALLENGE_HEADER, SessionLoginSupport.solvedChallenge(mvc))
						.contentType(MediaType.APPLICATION_JSON)
						.content(body(requestSet, date)))
				.andExpect(status().isAccepted());

		int marked = jdbc.sql("""
				INSERT INTO set_availability (set_id, booking_date, state)
				VALUES (:set, :date, 'STAFF_MARKED')
				ON CONFLICT (set_id, booking_date) DO NOTHING
				""").param("set", requestSet).param("date", date).update();
		assertEquals(1, marked, "the walk-in channel still finds the (set, date) row free (ADR-0025)");
	}

	@Test
	void aTakenDayRefusesTheRequest() throws Exception {
		LocalDate date = bookable().plusDays(3);
		jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) VALUES (:set, :date, 'STAFF_MARKED')")
				.param("set", requestSet).param("date", date).update();

		mvc.perform(post("/api/bookings")
						.header(SessionLoginSupport.CHALLENGE_HEADER, SessionLoginSupport.solvedChallenge(mvc))
						.contentType(MediaType.APPLICATION_JSON)
						.content(body(requestSet, date)))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("SET_TAKEN"));
	}
}
