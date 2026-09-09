package ai.riviera.platform.venue;

import java.time.LocalDate;
import java.time.ZoneId;

import jakarta.servlet.http.Cookie;
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

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.SessionLoginSupport;
import ai.riviera.platform.TestcontainersConfiguration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Retire instead of delete, at the HTTP seam (ADR-0019, RESPONSIBILITIES.md §venue): a set whose
 * bookings are all finished leaves the map by retiring and keeps its bookings; a live claim still
 * refuses the remove; every excluding read forgets the retired set and its spot is reusable; both
 * claim paths refuse it; and the facts port behind the booking view and the staff daily list keeps
 * naming it.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = { "riviera.operator.password=test-operator-pw",
		"booking.no-show.enabled=false" })
@AutoConfigureMockMvc
class SetRetireIT {

	private static final String OPERATOR = "operator";
	private static final String PASSWORD = "test-operator-pw";
	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");
	/** A service day that is over: a booking on it can be terminal history, a hold on it is past. */
	private static final LocalDate LAST_SEASON = LocalDate.now(TIRANE).minusDays(300);
	/** A service day still ahead: a booking on it is a guest still coming. */
	private static final LocalDate AHEAD = LocalDate.now(TIRANE).plusDays(30);
	private static final String SET_IN_USE_DETAIL = "This set has a booking or a current hold.";

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcClient jdbc;

	private Cookie operatorSession;

	@BeforeEach
	void logIn() throws Exception {
		operatorSession = SessionLoginSupport.operatorSession(mvc, OPERATOR, PASSWORD);
	}

	@Test
	void removingASetWithAFinishedBookingRetiresItAndKeepsTheBooking() throws Exception {
		long venue = createVenue("Retire Club");
		long setId = addSet(venue, "Row A", 1, 1, 1);
		seedBooking(venue, setId, "RETIRECL1", "CANCELLED", LAST_SEASON);

		mvc.perform(delete("/api/venues/{v}/sets/{s}", venue, setId).cookie(operatorSession).with(csrf()))
				.andExpect(status().isNoContent());

		assertTrue(isRetired(setId), "the row stays, stamped retired");
		assertEquals(setId, jdbc.sql("SELECT set_id FROM booking WHERE code = 'RETIRECL1'")
				.query(Long.class).single(), "the booking still names its spot");
	}

	@Test
	void removingASetWithALiveBookingIs409() throws Exception {
		long venue = createVenue("Live Club");
		long setId = addSet(venue, "Row A", 1, 1, 1);
		seedBooking(venue, setId, "LIVECLUB1", "CONFIRMED", AHEAD);
		seedHold(setId, AHEAD, "BOOKED_ONLINE");

		mvc.perform(delete("/api/venues/{v}/sets/{s}", venue, setId).cookie(operatorSession).with(csrf()))
				.andExpect(status().isConflict())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("SET_IN_USE"))
				.andExpect(jsonPath("$.detail").value(SET_IN_USE_DETAIL));

		assertFalse(isRetired(setId), "a guest still coming keeps the set on the map");
	}

	@Test
	void aRetiredSetIsGoneFromEveryExcludingRead() throws Exception {
		long venue = createVenue("Gone Club");
		long kept = addSet(venue, "Row A", 1, 1, 1);
		long retired = addSet(venue, "Row A", 2, 2, 1);
		seedBooking(venue, retired, "GONECLUB1", "COMPLETED", LAST_SEASON);
		seedHold(retired, LAST_SEASON, "BOOKED_ONLINE");
		retire(venue, retired);

		mvc.perform(get("/api/venues/{id}", venue))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.sets.length()").value(1))
				.andExpect(jsonPath("$.sets[0].id").value(kept));

		mvc.perform(get("/api/venues").param("beach", "Ksamil"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[?(@.id == %d)].availability.total".formatted(venue)).value(1))
				.andExpect(jsonPath("$[?(@.id == %d)].availability.free".formatted(venue)).value(1));

		mvc.perform(get("/api/venues/{id}/availability-calendar", venue)
						.param("from", LAST_SEASON.toString()).param("to", LAST_SEASON.toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[0].total").value(1))
				.andExpect(jsonPath("$[0].free").value(1));

		mvc.perform(get("/api/venues/{id}/availability", venue).cookie(operatorSession)
						.param("date", LAST_SEASON.toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(0));

		mvc.perform(patch("/api/venues/{v}/sets/{s}", venue, retired).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(setBody("Row A", 2, "WALK_IN", 2, 1)))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NO_SUCH_SET"));
		mvc.perform(delete("/api/venues/{v}/sets/{s}", venue, retired).cookie(operatorSession).with(csrf()))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NO_SUCH_SET"));
	}

	@Test
	void aRetiredSetsSpotCanBeReused() throws Exception {
		long venue = createVenue("Reuse Spot Club");
		long retired = addSet(venue, "Row A", 1, 1, 1);
		seedBooking(venue, retired, "REUSECLB1", "CANCELLED", LAST_SEASON);
		retire(venue, retired);

		long replacement = addSet(venue, "Row A", 1, 1, 1);

		mvc.perform(get("/api/venues/{id}", venue))
				.andExpect(jsonPath("$.sets.length()").value(1))
				.andExpect(jsonPath("$.sets[0].id").value(replacement));
	}

	@Test
	void bothClaimPathsRefuseARetiredSet() throws Exception {
		long venue = createVenue("Claim Club");
		long retired = addSet(venue, "Row A", 1, 1, 1);
		seedBooking(venue, retired, "CLAIMCLB1", "CANCELLED", LAST_SEASON);
		retire(venue, retired);

		mvc.perform(post("/api/bookings")
						.header(SessionLoginSupport.CHALLENGE_HEADER, SessionLoginSupport.solvedChallenge(mvc))
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"setId": %d, "bookingDate": "%s",
								 "contact": {"email": "retired@example.com", "fullName": "Late Guest", "phone": "+355699"}}
								""".formatted(retired, AHEAD)))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NO_SUCH_SET"));

		mvc.perform(post("/api/venues/{v}/sets/{s}/availability", venue, retired)
						.cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"date\":\"%s\"}".formatted(AHEAD)))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NO_SUCH_SET"));

		assertEquals(0, jdbc.sql("SELECT COUNT(*) FROM set_availability WHERE set_id = :set")
				.param("set", retired).query(Integer.class).single(), "neither refusal wrote a hold");
	}

	@Test
	void aBookingOnARetiredSetStillRendersItsSpot() throws Exception {
		long venue = createVenue("History Club");
		long retired = addSet(venue, "Row A", 3, 3, 1);
		seedBooking(venue, retired, "HISTCLUB1", "COMPLETED", LAST_SEASON);
		retire(venue, retired);

		mvc.perform(get("/api/bookings/{code}", "HISTCLUB1"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("COMPLETED"))
				.andExpect(jsonPath("$.rowLabel").value("Row A"))
				.andExpect(jsonPath("$.positionNo").value(3));

		mvc.perform(get("/api/venues/{v}/bookings", venue).cookie(operatorSession)
						.param("date", LAST_SEASON.toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].setId").value(retired))
				.andExpect(jsonPath("$[0].code").value("HISTCLUB1"));
	}

	private void retire(long venue, long setId) throws Exception {
		mvc.perform(delete("/api/venues/{v}/sets/{s}", venue, setId).cookie(operatorSession).with(csrf()))
				.andExpect(status().isNoContent());
		assertTrue(isRetired(setId));
	}

	private boolean isRetired(long setId) {
		return jdbc.sql("SELECT retired_at IS NOT NULL FROM set_position WHERE id = :id")
				.param("id", setId).query(Boolean.class).single();
	}

	private long createVenue(String name) throws Exception {
		MvcResult result = mvc.perform(post("/api/venues").cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"name":"%s","beach":"Ksamil","region":"Riviera","description":"on the shore",
								 "bookingMode":"INSTANT","payoutCurrency":"EUR","bookingCutoff":"18:00"}
								""".formatted(name)))
				.andExpect(status().isCreated())
				.andReturn();
		return idFrom(result);
	}

	private long addSet(long venue, String rowLabel, int positionNo, int gridX, int gridY) throws Exception {
		MvcResult result = mvc.perform(post("/api/venues/{v}/sets", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(setBody(rowLabel, positionNo, "ONLINE", gridX, gridY)))
				.andExpect(status().isCreated())
				.andReturn();
		return idFrom(result);
	}

	private static String setBody(String rowLabel, int positionNo, String pool, int gridX, int gridY) {
		return """
				{"rowLabel":"%s","positionNo":%d,"tier":"STANDARD","pool":"%s",
				 "price":{"minorUnits":3000,"currency":"EUR"},"gridX":%d,"gridY":%d}
				""".formatted(rowLabel, positionNo, pool, gridX, gridY);
	}

	private void seedBooking(long venue, long setId, String code, String status, LocalDate day) {
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:email, 'Guest', '+355600') RETURNING id")
				.param("email", code.toLowerCase() + "@example.com")
				.query(Long.class).single();
		jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status)
				VALUES (:code, :venue, :set, :cust, :day, 3000, 'EUR', :status)
				""")
				.param("code", code).param("venue", venue).param("set", setId)
				.param("cust", customer).param("day", day).param("status", status).update();
	}

	private void seedHold(long setId, LocalDate day, String state) {
		jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) VALUES (:set, :day, :state)")
				.param("set", setId).param("day", day).param("state", state).update();
	}

	private static long idFrom(MvcResult result) throws Exception {
		String json = result.getResponse().getContentAsString();
		return Long.parseLong(com.jayway.jsonpath.JsonPath.read(json, "$.id").toString());
	}
}
