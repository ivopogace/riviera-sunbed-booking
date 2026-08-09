package ai.riviera.platform.booking;

import java.time.LocalDate;
import java.time.ZoneId;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.SessionLoginSupport;
import ai.riviera.platform.TestcontainersConfiguration;

import jakarta.servlet.http.Cookie;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * HTTP contract of the operator check-in (#583): {@code POST
 * /api/venues/{venueId}/bookings/{code}/check-in} transitions a {@code CONFIRMED} booking to
 * {@code COMPLETED} on its service date, exactly once — AC-1/2/4/5. Errors are RFC-7807 with a
 * stable {@code code}, and no response body ever carries the booking code (invariant #7):
 * wrong-day answers name the booking's <em>date</em>; an unknown code and a foreign venue's code
 * are indistinguishable {@code BOOKING_NOT_FOUND} (non-enumerating).
 *
 * <p>Every test books against its own freshly-created venue (granted to the bootstrap operator),
 * so no residue lands on the shared seed venue; the service date is "today in
 * {@code Europe/Tirane}" (invariant #6), computed here exactly as the service does.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=test-operator-pw")
@AutoConfigureMockMvc
class CheckInFlowIT {

	private static final String OPERATOR = "operator";
	private static final String PASSWORD = "test-operator-pw";
	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcClient jdbc;

	private Cookie operatorSession;

	@BeforeEach
	void logIn() throws Exception {
		operatorSession = SessionLoginSupport.operatorSession(mvc, OPERATOR, PASSWORD);
	}

	private long firstSetOf(long venueId) {
		return jdbc.sql("SELECT id FROM set_position WHERE venue_id = :v ORDER BY id LIMIT 1")
				.param("v", venueId).query(Long.class).single();
	}

	private long insertConfirmed(String code, long venueId, LocalDate date) {
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		long set = firstSetOf(venueId);
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status, confirmed_at)
				VALUES (:code, :venue, :set, :cust, :date, 4500, 'EUR', 'CONFIRMED', now())
				RETURNING id
				""")
				.param("code", code).param("venue", venueId).param("set", set)
				.param("cust", customer).param("date", date)
				.query(Long.class).single();
	}

	private String statusOf(long bookingId) {
		return jdbc.sql("SELECT status FROM booking WHERE id = :id")
				.param("id", bookingId).query(String.class).single();
	}

	private static String uniqueCode(String prefix) {
		return prefix + System.nanoTime() % 1_000_000;
	}

	private static LocalDate today() {
		return LocalDate.now(TIRANE);
	}

	@Test
	void checksInConfirmedBookingOnServiceDate() throws Exception {
		long venue = newOwnedVenue("CI Ok Club");
		String code = uniqueCode("CIOK");
		long bookingId = insertConfirmed(code, venue, today());

		mvc.perform(post("/api/venues/{v}/bookings/{code}/check-in", venue, code)
						.cookie(operatorSession).with(csrf()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.setId").value(firstSetOf(venue)))
				.andExpect(jsonPath("$.bookingDate").value(today().toString()));

		assertEquals("COMPLETED", statusOf(bookingId));
		assertNotNull(jdbc.sql("SELECT completed_at FROM booking WHERE id = :id")
				.param("id", bookingId).query(java.time.Instant.class).single());
	}

	@Test
	void secondCheckInIsRefusedDistinctly() throws Exception {
		long venue = newOwnedVenue("CI Twice Club");
		String code = uniqueCode("CITWICE");
		long bookingId = insertConfirmed(code, venue, today());

		mvc.perform(post("/api/venues/{v}/bookings/{code}/check-in", venue, code)
						.cookie(operatorSession).with(csrf()))
				.andExpect(status().isOk());
		MvcResult second = mvc.perform(post("/api/venues/{v}/bookings/{code}/check-in", venue, code)
						.cookie(operatorSession).with(csrf()))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("ALREADY_CHECKED_IN"))
				.andReturn();

		assertEquals("COMPLETED", statusOf(bookingId));
		assertNoCodeLeak(second, code);
	}

	@Test
	void wrongDayScanIsRefusedNamingTheDate() throws Exception {
		long venue = newOwnedVenue("CI Day Club");
		String code = uniqueCode("CIDAY");
		LocalDate tomorrow = today().plusDays(1);
		long bookingId = insertConfirmed(code, venue, tomorrow);

		MvcResult result = mvc.perform(post("/api/venues/{v}/bookings/{code}/check-in", venue, code)
						.cookie(operatorSession).with(csrf()))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("WRONG_SERVICE_DATE"))
				.andExpect(jsonPath("$.bookingDate").value(tomorrow.toString()))
				.andReturn();

		assertEquals("CONFIRMED", statusOf(bookingId));
		assertNoCodeLeak(result, code);
	}

	@Test
	void foreignVenueCodeReadsAsNotFound() throws Exception {
		long venue = newOwnedVenue("CI Foreign Base");
		String foreign = uniqueCode("CIFOREIGN");
		long otherVenue = jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES ('Foreign Club', 'Foreign Beach', 'Foreign Region', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""").query(Long.class).single();
		jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:venue, 'A', 1, 'STANDARD', 'ONLINE', 4500, 'EUR', 1, 1)
				""").param("venue", otherVenue).update();
		long foreignBooking = insertConfirmed(foreign, otherVenue, today());

		MvcResult foreignResult = mvc.perform(
						post("/api/venues/{v}/bookings/{code}/check-in", venue, foreign)
								.cookie(operatorSession).with(csrf()))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("BOOKING_NOT_FOUND"))
				.andReturn();
		mvc.perform(post("/api/venues/{v}/bookings/{code}/check-in", venue, "ZZZZ99999X")
						.cookie(operatorSession).with(csrf()))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("BOOKING_NOT_FOUND"));

		assertEquals("CONFIRMED", statusOf(foreignBooking));
		assertNoCodeLeak(foreignResult, foreign);
	}

	@Test
	void cancelledCodeReadsAsNotFound() throws Exception {
		long venue = newOwnedVenue("CI Gone Club");
		String code = uniqueCode("CIGONE");
		long bookingId = insertConfirmed(code, venue, today());
		jdbc.sql("UPDATE booking SET status = 'CANCELLED', cancelled_at = now() WHERE id = :id")
				.param("id", bookingId).update();

		mvc.perform(post("/api/venues/{v}/bookings/{code}/check-in", venue, code)
						.cookie(operatorSession).with(csrf()))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("BOOKING_NOT_FOUND"));

		assertEquals("CANCELLED", statusOf(bookingId));
	}

	/** A fresh venue granted to the bootstrap operator — isolates money/list assertions (AC-7/8). */
	private long newOwnedVenue(String name) {
		long venue = jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES (:n, 'CI Beach', 'CI Region', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""").param("n", name).query(Long.class).single();
		jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:venue, 'A', 1, 'STANDARD', 'ONLINE', 4500, 'EUR', 1, 1),
				       (:venue, 'A', 2, 'STANDARD', 'ONLINE', 4500, 'EUR', 2, 1)
				""").param("venue", venue).update();
		jdbc.sql("INSERT INTO operator_venue (venue_id, operator_id) "
						+ "SELECT :v, id FROM operator WHERE username = :u")
				.param("v", venue).param("u", OPERATOR).update();
		return venue;
	}

	@Test
	void arrivalsAndTakingsCountCheckedInBookings() throws Exception {
		long venue = newOwnedVenue("CI Widen Club");
		String checkedIn = uniqueCode("CILIST1");
		String upcoming = uniqueCode("CILIST2");
		insertConfirmed(checkedIn, venue, today());
		insertConfirmed(upcoming, venue, today());

		mvc.perform(post("/api/venues/{v}/bookings/{code}/check-in", venue, checkedIn)
						.cookie(operatorSession).with(csrf()))
				.andExpect(status().isOk());

		mvc.perform(get("/api/venues/{v}/bookings", venue).cookie(operatorSession)
						.param("date", today().toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(2))
				.andExpect(jsonPath("$[?(@.code == '%s')].checkedIn".formatted(checkedIn)).value(true))
				.andExpect(jsonPath("$[?(@.code == '%s')].checkedIn".formatted(upcoming)).value(false));

		mvc.perform(get("/api/venues/{v}/takings", venue).cookie(operatorSession)
						.param("date", today().toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.gross.minorUnits").value(9000));
	}

	@Test
	void completedBookingIsNeitherCancellableNorWeatherRefundable() throws Exception {
		long venue = newOwnedVenue("CI Fence Club");
		String checkedIn = uniqueCode("CIFENCE1");
		String upcoming = uniqueCode("CIFENCE2");
		long completedId = insertConfirmed(checkedIn, venue, today());
		insertConfirmed(upcoming, venue, today());

		mvc.perform(post("/api/venues/{v}/bookings/{code}/check-in", venue, checkedIn)
						.cookie(operatorSession).with(csrf()))
				.andExpect(status().isOk());

		mvc.perform(post("/api/bookings/{code}/cancel", checkedIn).with(csrf()))
				.andExpect(status().is4xxClientError());
		assertEquals("COMPLETED", statusOf(completedId));

		mvc.perform(post("/api/venues/{v}/weather-refund", venue).cookie(operatorSession)
						.with(csrf()).param("date", today().toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.refundedCount").value(1));
		assertEquals("COMPLETED", statusOf(completedId));
	}

	/** Invariant #7: no error body may echo the bearer credential — not even in {@code instance}. */
	private static void assertNoCodeLeak(MvcResult result, String code) throws Exception {
		String body = result.getResponse().getContentAsString();
		assertFalse(body.contains(code), "problem body must not carry the booking code: " + body);
	}
}
