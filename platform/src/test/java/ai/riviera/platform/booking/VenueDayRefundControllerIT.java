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
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * HTTP contract of the venue day refund (ADR-0027, AC-5): {@code POST
 * /api/venues/{venueId}/bookings/{code}/day-refund?date=} is operator-gated (anonymous {@code 401}), answers
 * the server-decided refund with its kind and released mark, refuses an attended day and a replay with stable
 * RFC-7807 codes, and reads a foreign venue's code and an unknown one alike as {@code BOOKING_NOT_FOUND}
 * (non-enumerating). No body ever carries the booking code (invariant #7). Every test seeds its own venue,
 * granted to the bootstrap operator.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = { "riviera.operator.password=test-operator-pw", "booking.no-show.enabled=false" })
@AutoConfigureMockMvc
class VenueDayRefundControllerIT {

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

	private long newVenue(String name, boolean ownedByBootstrap) {
		long venue = jdbc.sql("""
				INSERT INTO venue (name, beach, booking_mode, commission_bps, payout_currency)
				VALUES (:name, 'KSAMIL', 'INSTANT', 1500, 'EUR') RETURNING id
				""").param("name", name).query(Long.class).single();
		jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor, price_currency, grid_x, grid_y)
				VALUES (:venue, 'A', 1, 'STANDARD', 'ONLINE', 4500, 'EUR', 1, 1)
				""").param("venue", venue).update();
		if (ownedByBootstrap) {
			jdbc.sql("INSERT INTO operator_venue (venue_id, operator_id) SELECT :venue, id FROM operator WHERE username = :u")
					.param("venue", venue).param("u", OPERATOR).update();
		}
		return venue;
	}

	private long insertConfirmedSpan(String code, long venueId, LocalDate first, int days, long amountMinor) {
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		long set = jdbc.sql("SELECT id FROM set_position WHERE venue_id = :v ORDER BY id LIMIT 1")
				.param("v", venueId).query(Long.class).single();
		long id = jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, last_date,
				                     amount_minor, amount_currency, status, confirmed_at)
				VALUES (:code, :venue, :set, :cust, :first, :last, :amount, 'EUR', 'CONFIRMED', now())
				RETURNING id
				""")
				.param("code", code).param("venue", venueId).param("set", set).param("cust", customer)
				.param("first", first).param("last", first.plusDays(days - 1)).param("amount", amountMinor)
				.query(Long.class).single();
		for (int i = 0; i < days; i++) {
			jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) VALUES (:set, :date, 'BOOKED_ONLINE')")
					.param("set", set).param("date", first.plusDays(i)).update();
		}
		return id;
	}

	private String statusOf(long bookingId) {
		return jdbc.sql("SELECT status FROM booking WHERE id = :id").param("id", bookingId).query(String.class).single();
	}

	private static String uniqueCode(String prefix) {
		return prefix + System.nanoTime() % 1_000_000;
	}

	private static LocalDate today() {
		return LocalDate.now(TIRANE);
	}

	/** Invariant #7: no body may echo the bearer credential — not even in {@code instance}. */
	private static void assertNoCodeLeak(MvcResult result, String code) throws Exception {
		String body = result.getResponse().getContentAsString();
		assertFalse(body.contains(code), "the body must not carry the booking code: " + body);
	}

	@Test
	void refundsAStaysDayAndAnswersTheKindTheAmountAndTheRelease() throws Exception {
		long venue = newVenue("VDR Stay Club", true);
		String code = uniqueCode("VDRSTAY");
		LocalDate first = today().plusDays(30);
		long id = insertConfirmedSpan(code, venue, first, 5, 25000L);

		MvcResult result = mvc.perform(post("/api/venues/{v}/bookings/{code}/day-refund", venue, code)
						.cookie(operatorSession).with(csrf()).param("date", first.plusDays(2).toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.kind").value("DAY_REFUNDED"))
				.andExpect(jsonPath("$.serviceDate").value(first.plusDays(2).toString()))
				.andExpect(jsonPath("$.refundMinor").value(5000))
				.andExpect(jsonPath("$.currency").value("EUR"))
				.andExpect(jsonPath("$.released").value(true))
				.andReturn();
		assertNoCodeLeak(result, code);
		assertEquals("CONFIRMED", statusOf(id));

		MvcResult replay = mvc.perform(post("/api/venues/{v}/bookings/{code}/day-refund", venue, code)
						.cookie(operatorSession).with(csrf()).param("date", first.plusDays(2).toString()))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("DAY_ALREADY_REFUNDED"))
				.andReturn();
		assertNoCodeLeak(replay, code);
	}

	@Test
	void cancelsALoneOneDayBookingWhole() throws Exception {
		long venue = newVenue("VDR Lone Club", true);
		String code = uniqueCode("VDRLONE");
		LocalDate date = today().minusDays(3);
		long id = insertConfirmedSpan(code, venue, date, 1, 4500L);

		mvc.perform(post("/api/venues/{v}/bookings/{code}/day-refund", venue, code)
						.cookie(operatorSession).with(csrf()).param("date", date.toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.kind").value("BOOKING_CANCELLED"))
				.andExpect(jsonPath("$.refundMinor").value(4500))
				.andExpect(jsonPath("$.released").value(true));
		assertEquals("CANCELLED", statusOf(id));
	}

	@Test
	void anAttendedDayIsRefusedAndSaysSo() throws Exception {
		long venue = newVenue("VDR Attended Club", true);
		String code = uniqueCode("VDRATT");
		LocalDate first = today().minusDays(2);
		long id = insertConfirmedSpan(code, venue, first, 3, 9000L);
		jdbc.sql("UPDATE booking_day SET attended_at = now() WHERE booking_id = :id AND service_date = :d")
				.param("id", id).param("d", first).update();

		MvcResult result = mvc.perform(post("/api/venues/{v}/bookings/{code}/day-refund", venue, code)
						.cookie(operatorSession).with(csrf()).param("date", first.toString()))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("DAY_ATTENDED"))
				.andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("checked in")))
				.andReturn();
		assertNoCodeLeak(result, code);
	}

	/** AC-5: a code from another venue at an owned venue is not found, exactly as an unknown code (#13, #7). */
	@Test
	void aForeignCodeAtAnOwnedVenueIsNotFound() throws Exception {
		long owned = newVenue("VDR Owned Club", true);
		long other = newVenue("VDR Other Club", false);
		String foreign = uniqueCode("VDRFOREIGN");
		LocalDate date = today().plusDays(10);
		long foreignBooking = insertConfirmedSpan(foreign, other, date, 2, 9000L);

		MvcResult result = mvc.perform(post("/api/venues/{v}/bookings/{code}/day-refund", owned, foreign)
						.cookie(operatorSession).with(csrf()).param("date", date.toString()))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("BOOKING_NOT_FOUND"))
				.andReturn();
		mvc.perform(post("/api/venues/{v}/bookings/{code}/day-refund", owned, "ZZZZ99999X")
						.cookie(operatorSession).with(csrf()).param("date", date.toString()))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("BOOKING_NOT_FOUND"));

		assertNoCodeLeak(result, foreign);
		assertEquals("CONFIRMED", statusOf(foreignBooking));
	}

	@Test
	void theDateIsRequired() throws Exception {
		long venue = newVenue("VDR Date Club", true);

		mvc.perform(post("/api/venues/{v}/bookings/{code}/day-refund", venue, "ANYCODE01")
						.cookie(operatorSession).with(csrf()))
				.andExpect(status().isBadRequest());
	}

	@Test
	void requiresAnOperator() throws Exception {
		mvc.perform(post("/api/venues/{v}/bookings/{code}/day-refund", 1L, "ANYCODE01").with(csrf())
						.param("date", "2020-01-01"))
				.andExpect(status().isUnauthorized());
	}
}
