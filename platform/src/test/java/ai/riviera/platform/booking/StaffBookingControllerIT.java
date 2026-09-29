package ai.riviera.platform.booking;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

import org.hamcrest.Matchers;
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

	/** A span in one INSERT, so the confirm trigger writes every service day; {@code stayId} groups a stretch. */
	private void seedSpan(String code, long setId, long customerId, String status, LocalDate first,
			LocalDate last, Long stayId) {
		jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, last_date,
				                     amount_minor, amount_currency, status, stay_id)
				VALUES (:code, :venue, :set, :customer, :first, :last, 4500, 'EUR', :status, :stay)
				""")
				.param("code", code).param("venue", MIRAMAR).param("set", setId)
				.param("customer", customerId).param("first", first).param("last", last)
				.param("status", status).param("stay", stayId)
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
	void aStayCoveringTheDateIsListed() throws Exception {
		// A stay's span, not its first day, is what puts it on a day's list (multi-day D3).
		LocalDate middle = LocalDate.of(2031, 8, 12);
		List<Long> sets = venueSets(1);
		long customer = newCustomer("stay-" + middle + "@e.com");
		seedBookingOn("U8STAY0001", sets.get(0), customer, "CONFIRMED", middle.minusDays(1));
		jdbc.sql("UPDATE booking SET last_date = :last WHERE code = 'U8STAY0001'")
				.param("last", middle.plusDays(1)).update();

		mvc.perform(get("/api/venues/{id}/bookings", MIRAMAR).cookie(operatorSession)
						.param("date", middle.toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].code").value("U8STAY0001"));
		mvc.perform(get("/api/venues/{id}/bookings", MIRAMAR).cookie(operatorSession)
						.param("date", middle.plusDays(2).toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(0));
	}

	/** Story 30: each row names the guest's whole span, so the view can tell arriving, staying and leaving apart. */
	@Test
	void eachRowCarriesTheGuestsSpan() throws Exception {
		LocalDate day = LocalDate.of(2032, 6, 10);
		List<Long> sets = venueSets(3);
		long customer = newCustomer("span-" + day + "@e.com");
		seedBookingOn("U8SPANONE1", sets.get(0), customer, "CONFIRMED", day);
		seedSpan("U8SPANMID1", sets.get(1), customer, "CONFIRMED", day.minusDays(1), day.plusDays(1), null);
		seedSpan("U8SPANEND1", sets.get(2), customer, "CONFIRMED", day.minusDays(2), day, null);

		mvc.perform(get("/api/venues/{id}/bookings", MIRAMAR).cookie(operatorSession)
						.param("date", day.toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(3))
				.andExpect(jsonPath("$[?(@.code == 'U8SPANONE1')].firstDate").value(day.toString()))
				.andExpect(jsonPath("$[?(@.code == 'U8SPANONE1')].lastDate").value(day.toString()))
				.andExpect(jsonPath("$[?(@.code == 'U8SPANMID1')].firstDate").value(day.minusDays(1).toString()))
				.andExpect(jsonPath("$[?(@.code == 'U8SPANMID1')].lastDate").value(day.plusDays(1).toString()))
				.andExpect(jsonPath("$[?(@.code == 'U8SPANEND1')].firstDate").value(day.minusDays(2).toString()))
				.andExpect(jsonPath("$[?(@.code == 'U8SPANEND1')].lastDate").value(day.toString()))
				.andExpect(jsonPath("$[*].attendance", Matchers.everyItem(Matchers.is("EXPECTED"))));
	}

	/** A stitched stretch that begins on the day is not an arrival: the row carries the stay's span and code. */
	@Test
	void aStitchedStretchCarriesTheStaysSpan() throws Exception {
		LocalDate moveDay = LocalDate.of(2032, 7, 12);
		List<Long> sets = venueSets(2);
		long customer = newCustomer("stitch-" + moveDay + "@e.com");
		long stay = jdbc.sql("""
				INSERT INTO stay (code, venue_id, first_date, last_date)
				VALUES ('U8STITCH01', :venue, :first, :last) RETURNING id
				""").param("venue", MIRAMAR).param("first", moveDay.minusDays(2)).param("last", moveDay.plusDays(1))
				.query(Long.class).single();
		seedSpan("U8STITCHA1", sets.get(0), customer, "CONFIRMED", moveDay.minusDays(2), moveDay.minusDays(1), stay);
		seedSpan("U8STITCHB1", sets.get(1), customer, "CONFIRMED", moveDay, moveDay.plusDays(1), stay);

		mvc.perform(get("/api/venues/{id}/bookings", MIRAMAR).cookie(operatorSession)
						.param("date", moveDay.toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].setId").value(sets.get(1)))
				.andExpect(jsonPath("$[0].code").value("U8STITCH01"))
				.andExpect(jsonPath("$[0].firstDate").value(moveDay.minusDays(2).toString()))
				.andExpect(jsonPath("$[0].lastDate").value(moveDay.plusDays(1).toString()));
	}

	/**
	 * Story 31: the row's attendance is the day's, read from {@code booking_day}, while
	 * {@code status} stays the stay's outcome — so "not checked in today" is answerable on a
	 * middle day and the last day, not only the first.
	 */
	@Test
	void attendanceIsTheDaysNotTheStays() throws Exception {
		// Nine to seven days back: clear of the swept no-show case's day, which shares this venue.
		LocalDate first = LocalDate.now(ZoneId.of("Europe/Tirane")).minusDays(9);
		List<Long> sets = venueSets(1);
		long customer = newCustomer("attend-" + first + "@e.com");
		seedSpan("U8ATTEND01", sets.get(0), customer, "CONFIRMED", first, first.plusDays(2), null);
		jdbc.sql("""
				UPDATE booking_day SET attended_at = now() WHERE service_date IN (:d1, :d2)
				  AND booking_id = (SELECT id FROM booking WHERE code = 'U8ATTEND01')
				""").param("d1", first).param("d2", first.plusDays(1)).update();

		markNoShows.sweep();

		for (int offset = 0; offset < 3; offset++) {
			String expected = offset < 2 ? "ATTENDED" : "MISSED";
			mvc.perform(get("/api/venues/{id}/bookings", MIRAMAR).cookie(operatorSession)
							.param("date", first.plusDays(offset).toString()))
					.andExpect(status().isOk())
					.andExpect(jsonPath("$[?(@.code == 'U8ATTEND01')].attendance").value(expected))
					.andExpect(jsonPath("$[?(@.code == 'U8ATTEND01')].status").value("COMPLETED"));
		}
	}

	/** ADR-0027 §5: a released day keeps the stay's row on that date, marked refunded and released; a held weather day is not. */
	@Test
	void aReleasedDayIsListedAndTold() throws Exception {
		LocalDate first = LocalDate.of(2034, 8, 1);
		List<Long> sets = venueSets(1);
		long customer = newCustomer("released-" + first + "@e.com");
		seedSpan("U8RELEASE1", sets.get(0), customer, "CONFIRMED", first, first.plusDays(2), null);
		jdbc.sql("""
				UPDATE booking_day SET refunded_at = now(), refund_minor = 1500, refund_reason = 'WEATHER'
				WHERE service_date = :d AND booking_id = (SELECT id FROM booking WHERE code = 'U8RELEASE1')
				""").param("d", first).update();
		jdbc.sql("""
				UPDATE booking_day SET refunded_at = now(), refund_minor = 1500, refund_reason = 'VENUE', released_at = now(),
				                       refunded_by_operator_id = 1
				WHERE service_date = :d AND booking_id = (SELECT id FROM booking WHERE code = 'U8RELEASE1')
				""").param("d", first.plusDays(1)).update();

		mvc.perform(get("/api/venues/{id}/bookings", MIRAMAR).cookie(operatorSession).param("date", first.toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[?(@.code == 'U8RELEASE1')].attendance").value("REFUNDED"))
				.andExpect(jsonPath("$[?(@.code == 'U8RELEASE1')].released").value(false));
		mvc.perform(get("/api/venues/{id}/bookings", MIRAMAR).cookie(operatorSession)
						.param("date", first.plusDays(1).toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[?(@.code == 'U8RELEASE1')].attendance").value("REFUNDED"))
				.andExpect(jsonPath("$[?(@.code == 'U8RELEASE1')].released").value(true))
				.andExpect(jsonPath("$[?(@.code == 'U8RELEASE1')].status").value("CONFIRMED"));
		mvc.perform(get("/api/venues/{id}/bookings", MIRAMAR).cookie(operatorSession)
						.param("date", first.plusDays(2).toString()))
				.andExpect(jsonPath("$[?(@.code == 'U8RELEASE1')].attendance").value("EXPECTED"))
				.andExpect(jsonPath("$[?(@.code == 'U8RELEASE1')].released").value(false));
	}

	@Test
	void bookingsListRequiresOperator() throws Exception {
		// AC-9: no operator credential → 401, never a public read of booking codes (invariant #7).
		mvc.perform(get("/api/venues/{id}/bookings", MIRAMAR).param("date", DAY.toString()))
				.andExpect(status().isUnauthorized());
	}
}
