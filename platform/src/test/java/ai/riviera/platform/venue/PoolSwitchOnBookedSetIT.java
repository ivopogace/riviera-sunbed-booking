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
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Invariant #3 as a reserve-time rule, across the three modules it touches: a booked set switched
 * to the walk-in pool refuses every <em>new</em> online reserve ({@code booking} +
 * {@code availability}), keeps its booked date claimed against a staff mark ({@code availability}),
 * and still lists its online booking on the staff daily view ({@code booking}). Rationale:
 * RESPONSIBILITIES.md §venue.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = { "riviera.operator.password=test-operator-pw",
		"booking.no-show.enabled=false" })
@AutoConfigureMockMvc
class PoolSwitchOnBookedSetIT {

	private static final String OPERATOR = "operator";
	private static final String PASSWORD = "test-operator-pw";
	/** Relative to today: the reserve fence and the staff mark both refuse a past date. */
	private static final LocalDate BOOKED_DAY = LocalDate.now(ZoneId.of("Europe/Tirane")).plusDays(30);

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
	void aWalkInSwitchRefusesNewOnlineReservesAndKeepsTheBookedDateClaimed() throws Exception {
		long venue = createVenue("Switch Club");
		long setId = addOnlineSet(venue);
		seedConfirmedBooking(venue, setId, "SWITCHCL1");

		switchToWalkIn(venue, setId);

		mvc.perform(post("/api/bookings")
						.header(SessionLoginSupport.CHALLENGE_HEADER, SessionLoginSupport.solvedChallenge(mvc))
						.contentType(MediaType.APPLICATION_JSON)
						.content(reserveBody(setId, BOOKED_DAY.plusDays(1))))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("SET_NOT_BOOKABLE_ONLINE"));

		mvc.perform(post("/api/venues/{v}/sets/{s}/availability", venue, setId)
						.cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"date\":\"%s\"}".formatted(BOOKED_DAY)))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("ALREADY_TAKEN"));

		assertEquals("BOOKED_ONLINE", jdbc.sql(
						"SELECT state FROM set_availability WHERE set_id = :set AND booking_date = :day")
						.param("set", setId).param("day", BOOKED_DAY).query(String.class).single(),
				"the booked date stays claimed by its own row (invariant #2)");
	}

	@Test
	void theDailyViewShowsTheOnlineBookingOnTheNowWalkInSet() throws Exception {
		long venue = createVenue("Daily Switch Club");
		long setId = addOnlineSet(venue);
		seedConfirmedBooking(venue, setId, "SWITCHCL2");

		switchToWalkIn(venue, setId);

		mvc.perform(get("/api/venues/{v}/bookings", venue).cookie(operatorSession)
						.param("date", BOOKED_DAY.toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].setId").value(setId))
				.andExpect(jsonPath("$[0].code").value("SWITCHCL2"));
	}

	private void switchToWalkIn(long venue, long setId) throws Exception {
		mvc.perform(patch("/api/venues/{v}/sets/{s}", venue, setId).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(setBody("WALK_IN")))
				.andExpect(status().isNoContent());
		assertEquals("WALK_IN", jdbc.sql("SELECT pool FROM set_position WHERE id = :set")
				.param("set", setId).query(String.class).single());
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

	private long addOnlineSet(long venue) throws Exception {
		MvcResult result = mvc.perform(post("/api/venues/{v}/sets", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(setBody("ONLINE")))
				.andExpect(status().isCreated())
				.andReturn();
		return idFrom(result);
	}

	private static String setBody(String pool) {
		return """
				{"rowLabel":"Row A","positionNo":1,"tier":"STANDARD","pool":"%s",
				 "price":{"minorUnits":3000,"currency":"EUR"},"gridX":1,"gridY":1}
				""".formatted(pool);
	}

	private static String reserveBody(long setId, LocalDate date) {
		return """
				{"setId": %d, "bookingDate": "%s",
				 "contact": {"email": "switch@example.com", "fullName": "Switch Guest", "phone": "+355699"}}
				""".formatted(setId, date);
	}

	/** A confirmed online booking and the availability row that reserve-time claim wrote for it. */
	private void seedConfirmedBooking(long venue, long setId, String code) {
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:email, 'Guest', '+355600') RETURNING id")
				.param("email", code.toLowerCase() + "@example.com")
				.query(Long.class).single();
		jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status)
				VALUES (:code, :venue, :set, :cust, :day, 3000, 'EUR', 'CONFIRMED')
				""")
				.param("code", code).param("venue", venue).param("set", setId)
				.param("cust", customer).param("day", BOOKED_DAY).update();
		jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) "
						+ "VALUES (:set, :day, 'BOOKED_ONLINE')")
				.param("set", setId).param("day", BOOKED_DAY).update();
	}

	private static long idFrom(MvcResult result) throws Exception {
		String json = result.getResponse().getContentAsString();
		return Long.parseLong(com.jayway.jsonpath.JsonPath.read(json, "$.id").toString());
	}
}
