package ai.riviera.platform.booking;

import java.time.LocalDate;
import java.time.ZoneId;

import com.jayway.jsonpath.JsonPath;

import org.junit.jupiter.api.AfterEach;
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

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * HTTP contract for {@code GET /api/bookings/{code}} (U6, AC-1/AC-2): 200 + summary and
 * <strong>server-computed</strong> refund terms (full before the cutoff; the venue's configurable
 * share after), 404 for an unknown code. Testcontainers Postgres + the real flow with the stub
 * gateway; the non-{@code FREE} cases are seeded directly (the create cutoff blocks past dates).
 *
 * <p>Those seeded venues carry a {@code 00:00} cutoff so the window classification is the same at
 * every hour the suite might run at. The trade is deliberate: this class pins which <em>window</em>
 * the HTTP response reflects, while {@code BookingCutoffTest} pins the boundary arithmetic against a
 * real evening cutoff time.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class BookingViewIT {

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcClient jdbc;

	// Use the LAST online set + a distinctive far-future date so this (set, date) can't collide with
	// other create-flow ITs sharing the Testcontainers context (invariant #2 would 409 otherwise).
	private static final LocalDate UNIQUE_DATE = LocalDate.of(2034, 6, 6);

	private long onlineSet() {
		return jdbc.sql("SELECT id FROM set_position WHERE pool = 'ONLINE' ORDER BY id DESC LIMIT 1")
				.query(Long.class).single();
	}

	private String createBooking(long setId, LocalDate date) throws Exception {
		String body = """
				{"setId": %d, "bookingDate": "%s",
				 "contact": {"email": "view@e.com", "fullName": "View Guest", "phone": "+355699"}}
				""".formatted(setId, date);
		String response = mvc.perform(post("/api/bookings").contentType(MediaType.APPLICATION_JSON)
						.content(body))
				.andExpect(status().isCreated())
				.andReturn().getResponse().getContentAsString();
		return JsonPath.read(response, "$.code");
	}

	@Test
	void viewReturnsDetailWithFullRefundBeforeCutoff() throws Exception {
		// A future (well-before-cutoff) booking: confirmed, fully cancellable, full refund.
		long setId = onlineSet();
		long price = jdbc.sql("SELECT price_minor FROM set_position WHERE id = :id")
				.param("id", setId).query(Long.class).single();
		String code = createBooking(setId, UNIQUE_DATE);

		mvc.perform(get("/api/bookings/{code}", code))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.code").value(code))
				.andExpect(jsonPath("$.status").value("CONFIRMED"))
				.andExpect(jsonPath("$.cancellable").value(true))
				.andExpect(jsonPath("$.beforeCutoff").value(true))
				.andExpect(jsonPath("$.amount.currency").value("EUR"))
				.andExpect(jsonPath("$.amount.minorUnits").value(price))
				// before the cutoff the refund-if-cancelled-now equals the amount paid (full).
				.andExpect(jsonPath("$.refundIfCancelledNow.minorUnits").value(price))
				.andExpect(jsonPath("$.refundedAmount").doesNotExist());
	}

	@Test
	void viewComputesPartialRefundInTheLateWindow() throws Exception {
		// Tomorrow behind a 00:00 cutoff is LATE at every hour of the run, so the tier is deterministic.
		seedLateCancelBooking("VIEWPART1", "partial@e.com", tirane().plusDays(1));

		mvc.perform(get("/api/bookings/{code}", "VIEWPART1"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.beforeCutoff").value(false))
				.andExpect(jsonPath("$.cancellable").value(true))
				.andExpect(jsonPath("$.refundIfCancelledNow.minorUnits").value(2250)); // 4500 × 50%
	}

	@Test
	void viewOffersNoCancelOnceTheServiceDayHasPassed() throws Exception {
		seedLateCancelBooking("VIEWPAST1", "spent@e.com", tirane().minusDays(3));

		mvc.perform(get("/api/bookings/{code}", "VIEWPAST1"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("CONFIRMED"))
				.andExpect(jsonPath("$.cancellable").value(false))
				.andExpect(jsonPath("$.refundIfCancelledNow.minorUnits").value(0));
	}

	@Test
	void reportsPayWindowClosedForAnOpenServiceDay() throws Exception {
		seedLateCancelBooking("VIEWPAY01", "toolate@e.com", tirane());
		markAwaitingPayment("VIEWPAY01");

		mvc.perform(get("/api/bookings/{code}", "VIEWPAY01"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("AWAITING_PAYMENT"))
				.andExpect(jsonPath("$.payWindowClosed").value(true))
				.andExpect(jsonPath("$.payment").doesNotExist());
	}

	@Test
	void leavesThePayWindowOpenBeforeTheServiceDay() throws Exception {
		seedLateCancelBooking("VIEWPAY02", "intime@e.com", tirane().plusDays(2));
		markAwaitingPayment("VIEWPAY02");

		mvc.perform(get("/api/bookings/{code}", "VIEWPAY02"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.payWindowClosed").value(false));
	}

	/** The seed helper writes a CONFIRMED booking; the pay fence only ever bites before that. */
	private void markAwaitingPayment(String code) {
		jdbc.sql("UPDATE booking SET status = 'AWAITING_PAYMENT', confirmed_at = NULL WHERE code = :c")
				.param("c", code).update();
	}

	/**
	 * Drop this class's {@code AWAITING_PAYMENT} rows before the next test class runs.
	 *
	 * <p>Not hygiene — correctness for everyone else. The container is shared across the suite, and
	 * the abandoned sweep's service-day arm selects <em>any</em> {@code AWAITING_PAYMENT} row dated
	 * on or before today. A surviving {@code VIEWPAY01} would be swept and counted by
	 * {@code AbandonedBookingSweepIT} and {@code AbandonedSweepSurvivesWedgedJobIT}, both of which
	 * assert exact counts.
	 */
	@AfterEach
	void dropAwaitingPaymentRows() {
		jdbc.sql("DELETE FROM booking WHERE code LIKE 'VIEWPAY%'").update();
	}

	private static LocalDate tirane() {
		return LocalDate.now(ZoneId.of("Europe/Tirane"));
	}

	/**
	 * A self-contained venue offering a 50% late-cancel refund, its one online set, and a
	 * {@code CONFIRMED} booking on {@code date}. Isolated from the seed venue so other ITs'
	 * assumptions hold, and its {@code 00:00} cutoff keeps the window classification independent of
	 * the wall-clock hour the suite happens to run at.
	 */
	private void seedLateCancelBooking(String code, String email, LocalDate date) {
		long venueId = jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency,
				                   late_cancel_refund_bps, booking_cutoff)
				VALUES (:name, 'Test Beach', 'Riviera', 'INSTANT', 1500, 'EUR', 5000, TIME '00:00')
				RETURNING id
				""").param("name", "Late Refund Club " + code).query(Long.class).single();
		long setId = jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:venue, 'A', 1, 'STANDARD', 'ONLINE', 4500, 'EUR', 1, 1)
				RETURNING id
				""").param("venue", venueId).query(Long.class).single();
		long customerId = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:email, 'Partial Guest', '+355600') RETURNING id")
				.param("email", email).query(Long.class).single();
		jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status, confirmed_at)
				VALUES (:code, :venue, :set, :cust, :date, 4500, 'EUR', 'CONFIRMED', NOW())
				""")
				.param("code", code).param("venue", venueId).param("set", setId)
				.param("cust", customerId).param("date", date).update();
	}

	@Test
	void unknownCodeReturns404() throws Exception {
		// The body must never echo the attempted code — it is a bearer credential (invariant #7).
		mvc.perform(get("/api/bookings/{code}", "NOSUCHCODE"))
				.andExpect(status().isNotFound())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("NO_SUCH_BOOKING"))
				.andExpect(content().string(not(containsString("NOSUCHCODE"))));
	}
}
