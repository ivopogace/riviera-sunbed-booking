package ai.riviera.platform.booking;

import java.time.LocalDate;
import java.time.ZoneId;

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

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * HTTP contract for the pre-reserve terms read {@code GET /api/bookings/cancellation-terms}
 * (#795, AC-4): 200 with {@code {window, freeCancellationEndsAt, lateCancelRefundBps}} for a known
 * set, the {@code ApiProblem} 404 for an unknown one, and the route pin both ways — the literal
 * segment is not swallowed by {@code GET /api/bookings/{code}} nor vice versa (R-2).
 *
 * <p>Like {@code BookingViewIT}, the seeded venue carries a {@code 00:00} cutoff so date choice
 * alone fixes the window at every hour the suite might run at: far future → FREE, tomorrow → LATE,
 * today → CLOSED. {@code BookingCutoffTest} pins the boundary arithmetic against a real evening
 * cutoff; this class pins which window the HTTP response reflects.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "booking.no-show.enabled=false")
@AutoConfigureMockMvc
class CancellationTermsEndpointIT {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcClient jdbc;

	/** A midnight-cutoff venue offering a 40% late share, with one online set; returns the set id. */
	private long seedMidnightCutoffSet(String venueName) {
		long venueId = jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency,
				                   late_cancel_refund_bps, booking_cutoff)
				VALUES (:name, 'Test Beach', 'Riviera', 'INSTANT', 1500, 'EUR', 4000, TIME '00:00')
				RETURNING id
				""").param("name", venueName).query(Long.class).single();
		return jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:venue, 'A', 1, 'STANDARD', 'ONLINE', 4500, 'EUR', 1, 1)
				RETURNING id
				""").param("venue", venueId).query(Long.class).single();
	}

	@Test
	void quotesFreeWindowWithDeadlineForAFarFutureDate() throws Exception {
		long setId = seedMidnightCutoffSet("Terms Free Club");
		LocalDate date = LocalDate.of(2034, 6, 6);

		mvc.perform(get("/api/bookings/cancellation-terms")
						.param("setId", String.valueOf(setId)).param("date", date.toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.window").value("FREE"))
				.andExpect(jsonPath("$.freeCancellationEndsAt")
						.value(date.minusDays(1).atStartOfDay(TIRANE).toInstant().toString()))
				.andExpect(jsonPath("$.lateCancelRefundBps").value(0));
	}

	@Test
	void quotesLateWindowWithVenueShareForTomorrow() throws Exception {
		long setId = seedMidnightCutoffSet("Terms Late Club");
		LocalDate tomorrow = LocalDate.now(TIRANE).plusDays(1);

		mvc.perform(get("/api/bookings/cancellation-terms")
						.param("setId", String.valueOf(setId)).param("date", tomorrow.toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.window").value("LATE"))
				.andExpect(jsonPath("$.lateCancelRefundBps").value(4000));
	}

	@Test
	void quotesClosedWindowForToday() throws Exception {
		long setId = seedMidnightCutoffSet("Terms Closed Club");
		LocalDate today = LocalDate.now(TIRANE);

		mvc.perform(get("/api/bookings/cancellation-terms")
						.param("setId", String.valueOf(setId)).param("date", today.toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.window").value("CLOSED"))
				.andExpect(jsonPath("$.lateCancelRefundBps").value(0));
	}

	@Test
	void unknownSetIsTheApiProblem404() throws Exception {
		mvc.perform(get("/api/bookings/cancellation-terms")
						.param("setId", "999999999").param("date", "2034-06-06"))
				.andExpect(status().isNotFound())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("NO_SUCH_SET"));
	}

	@Test
	void malformedDateIsTheStanding400Contract() throws Exception {
		mvc.perform(get("/api/bookings/cancellation-terms")
						.param("setId", "1").param("date", "not-a-date"))
				.andExpect(status().isBadRequest())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON));
	}

	@Test
	void codeRouteStillResolvesBesideTheLiteralSegment() throws Exception {
		// R-2 both ways: the literal never binds as a code, and a code never hits the terms read.
		mvc.perform(get("/api/bookings/{code}", "NOSUCHCODE"))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NO_SUCH_BOOKING"));
	}
}
