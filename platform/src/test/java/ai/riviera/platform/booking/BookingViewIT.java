package ai.riviera.platform.booking;

import java.time.LocalDate;

import com.jayway.jsonpath.JsonPath;

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
 * gateway; an after-cutoff case is seeded directly (the create cutoff blocks past dates).
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
	void viewComputesPartialRefundAfterCutoff() throws Exception {
		// A self-contained venue offering a 50% late-cancel refund + a CONFIRMED booking on a past
		// date (after the cutoff). Isolated from the seed venue so other ITs' assumptions hold.
		long venueId = jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency,
				                   late_cancel_refund_bps)
				VALUES ('Late Refund Club', 'Test Beach', 'Riviera', 'INSTANT', 1500, 'EUR', 5000)
				RETURNING id
				""").query(Long.class).single();
		long setId = jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:venue, 'A', 1, 'STANDARD', 'ONLINE', 4500, 'EUR', 1, 1)
				RETURNING id
				""").param("venue", venueId).query(Long.class).single();
		long customerId = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES ('partial@e.com', 'Partial Guest', '+355600') RETURNING id")
				.query(Long.class).single();
		jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status, confirmed_at)
				VALUES ('VIEWPART1', :venue, :set, :cust, :date, 4500, 'EUR', 'CONFIRMED', NOW())
				""")
				.param("venue", venueId).param("set", setId).param("cust", customerId)
				.param("date", LocalDate.now().minusDays(1)).update();

		mvc.perform(get("/api/bookings/{code}", "VIEWPART1"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.beforeCutoff").value(false))
				.andExpect(jsonPath("$.cancellable").value(true))
				.andExpect(jsonPath("$.refundIfCancelledNow.minorUnits").value(2250)); // 4500 × 50%
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
