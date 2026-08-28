package ai.riviera.platform.booking;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.SessionLoginSupport;
import ai.riviera.platform.TestcontainersConfiguration;

import jakarta.servlet.http.Cookie;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * HTTP contract for the U8 staff daily-bookings read (issue #10, AC-8/AC-9): the operator-gated
 * {@code GET /api/venues/{id}/bookings} lists exactly the venue's <strong>CONFIRMED</strong>
 * bookings for the date — each as {@code (setId, code)} — excluding awaiting-payment and cancelled
 * ones, and an unauthenticated read is 401 (booking codes are bearer credentials, invariant #7).
 * Bookings are seeded directly so all four lifecycle states are present deterministically.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = { "riviera.operator.password=test-operator-pw",
		"booking.no-show.enabled=false" })
@AutoConfigureMockMvc
class StaffBookingControllerIT {

	private static final String OPERATOR = "operator";
	private static final String PASSWORD = "test-operator-pw";
	private static final long MIRAMAR = 1L;
	private static final LocalDate DAY = LocalDate.of(2033, 7, 15);

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	ai.riviera.platform.booking.application.checkin.MarkNoShows markNoShows;

	private Cookie operatorSession;

	@BeforeEach
	void logIn() throws Exception {
		operatorSession = SessionLoginSupport.operatorSession(mvc, OPERATOR, PASSWORD);
	}

	private List<Long> venueSets(int n) {
		return jdbc.sql("SELECT id FROM set_position WHERE venue_id = :v ORDER BY id LIMIT :n")
				.param("v", MIRAMAR).param("n", n)
				.query(Long.class).list();
	}

	private long newCustomer(String email) {
		return jdbc.sql("""
				INSERT INTO customer (email, full_name, phone)
				VALUES (:email, 'Daily Guest', '+355699') RETURNING id
				""").param("email", email).query(Long.class).single();
	}

	private void seedBooking(String code, long setId, long customerId, String status) {
		seedBookingOn(code, setId, customerId, status, DAY);
	}

	private void seedBookingOn(String code, long setId, long customerId, String status,
			LocalDate date) {
		jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status)
				VALUES (:code, :venue, :set, :customer, :date, 4500, 'EUR', :status)
				""")
				.param("code", code).param("venue", MIRAMAR).param("set", setId)
				.param("customer", customerId).param("date", date).param("status", status)
				.update();
	}

	@Test
	void listsOnlyConfirmedBookingsForVenueAndDate() throws Exception {
		List<Long> sets = venueSets(4);
		long customer = newCustomer("daily-" + DAY + "@e.com");
		seedBooking("U8CONFIRMA", sets.get(0), customer, "CONFIRMED");
		seedBooking("U8CONFIRMB", sets.get(1), customer, "CONFIRMED");
		seedBooking("U8AWAITING1", sets.get(2), customer, "AWAITING_PAYMENT");
		seedBooking("U8CANCELLED", sets.get(3), customer, "CANCELLED");

		mvc.perform(get("/api/venues/{id}/bookings", MIRAMAR).cookie(operatorSession)
						.param("date", DAY.toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(2))
				.andExpect(jsonPath("$[0].setId").value(sets.get(0)))
				.andExpect(jsonPath("$[0].code").value("U8CONFIRMA"))
				.andExpect(jsonPath("$[1].setId").value(sets.get(1)))
				.andExpect(jsonPath("$[1].code").value("U8CONFIRMB"));
	}

	@Test
	void dailyViewListsSweptNoShows() throws Exception {
		LocalDate past = LocalDate.now(ZoneId.of("Europe/Tirane")).minusDays(4);
		List<Long> sets = venueSets(2);
		long customer = newCustomer("noshow-" + past + "@e.com");
		seedBookingOn("U8NOSHOW1", sets.get(0), customer, "CONFIRMED", past);
		seedBookingOn("U8DONE1", sets.get(1), customer, "COMPLETED", past);

		markNoShows.sweep();

		mvc.perform(get("/api/venues/{id}/bookings", MIRAMAR).cookie(operatorSession)
						.param("date", past.toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(2))
				.andExpect(jsonPath("$[?(@.code == 'U8NOSHOW1')].status").value("NO_SHOW"))
				.andExpect(jsonPath("$[?(@.code == 'U8DONE1')].status").value("COMPLETED"));
	}

	@Test
	void sameDayConfirmedBookingAppearsInTodaysList() throws Exception {
		// AC-11 (#791): a same-day confirmed booking lists exactly like an advance one.
		LocalDate today = LocalDate.now(ZoneId.of("Europe/Tirane"));
		List<Long> sets = venueSets(1);
		long customer = newCustomer("today-" + today + "@e.com");
		seedBookingOn("U8TODAY001", sets.get(0), customer, "CONFIRMED", today);

		mvc.perform(get("/api/venues/{id}/bookings", MIRAMAR).cookie(operatorSession)
						.param("date", today.toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].code").value("U8TODAY001"))
				.andExpect(jsonPath("$[0].setId").value(sets.get(0)));
	}

	@Test
	void bookingsListRequiresOperator() throws Exception {
		// AC-9: no operator credential → 401, never a public read of booking codes (invariant #7).
		mvc.perform(get("/api/venues/{id}/bookings", MIRAMAR).param("date", DAY.toString()))
				.andExpect(status().isUnauthorized());
	}
}
