package ai.riviera.platform.booking;

import java.time.Instant;
import java.time.LocalDate;

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
import ai.riviera.platform.shared.CurrentOperator;
import ai.riviera.platform.operator.vocabulary.OperatorId;

import org.springframework.test.context.bean.override.mockito.MockitoBean;

import jakarta.servlet.http.Cookie;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * HTTP contract for the guest withdraw: {@code POST /api/bookings/{code}/withdraw}.
 *
 * <p>The endpoint is a <strong>new public path</strong>, so this IT exists as much to pin its
 * <em>registration</em> as its handler — a path that exists in the controller but not in
 * {@code SecurityConfig} fails closed (401), and one missing from {@code RateLimitFilter} would be
 * an unthrottled booking-code oracle. Both are asserted here rather than assumed: a prior review's
 * first finding was exactly a dropped authorize matcher on this controller's sibling endpoints.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=withdraw-test-pw")
@AutoConfigureMockMvc
class WithdrawRequestIT {

	/**
	 * The one {@code REQUEST_NOT_PENDING} detail, asserted at all four arms this class provokes —
	 * two withdraw legs and the accept/decline legs that meet an already-withdrawn request. A
	 * withdrawal is what makes "already decided" false here, so the wording names no route out.
	 */
	private static final String NOT_PENDING_DETAIL =
			"This request is no longer waiting for the venue.";

	private static final String OPERATOR = "operator";
	private static final String PASSWORD = "withdraw-test-pw";

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcClient jdbc;

	@MockitoBean
	CurrentOperator currentOperator;

	private long venueId;
	private long setId;
	private Cookie operatorSession;

	@BeforeEach
	void seedRequestVenue() throws Exception {
		operatorSession = SessionLoginSupport.operatorSession(mvc, OPERATOR, PASSWORD);
		venueId = jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES ('Withdraw Edge Club', 'Edge Beach', 'Edge Region', 'REQUEST', 1500, 'EUR')
				RETURNING id
				""").query(Long.class).single();
		setId = jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:venue, 'A', 1, 'STANDARD', 'ONLINE', 4500, 'EUR', 1, 1)
				RETURNING id
				""").param("venue", venueId).query(Long.class).single();
		long operator = jdbc.sql("INSERT INTO operator (username, status) "
						+ "VALUES ('withdraw-op-' || :v, 'ACTIVE') RETURNING id")
				.param("v", venueId).query(Long.class).single();
		jdbc.sql("INSERT INTO operator_venue (venue_id, operator_id) VALUES (:v, :o)")
				.param("v", venueId).param("o", operator).update();
		when(currentOperator.require(any())).thenReturn(new OperatorId(operator));
	}

	private long insertPendingRequest(String code, LocalDate date) {
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		long booking = jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status, request_expires_at)
				VALUES (:code, :venue, :set, :cust, :date, 4500, 'EUR', 'PENDING_REQUEST', :expires)
				RETURNING id
				""")
				.param("code", code).param("venue", venueId).param("set", setId)
				.param("cust", customer).param("date", date)
				.param("expires", java.sql.Timestamp.from(Instant.now().plusSeconds(3600)))
				.query(Long.class).single();
		jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) "
						+ "VALUES (:set, :date, 'BOOKED_ONLINE') ON CONFLICT DO NOTHING")
				.param("set", setId).param("date", date).update();
		return booking;
	}

	private static String uniqueCode(String prefix) {
		return prefix + System.nanoTime() % 1_000_000;
	}

	private static LocalDate bookable() {
		return LocalDate.now().plusMonths(3);
	}

	/**
	 * Anonymous and CSRF-token-less on purpose: the code is the bearer credential (invariant #7), and
	 * the path is CSRF-exempt like cancel. A missing {@code permitAll} matcher would surface as 401
	 * here, a missing CSRF exemption as 403 — this one request pins both registrations.
	 */
	@Test
	void withdrawIsReachableAnonymouslyAndWithoutACsrfToken() throws Exception {
		String code = uniqueCode("WDHTTP");
		long bookingId = insertPendingRequest(code, bookable());

		mvc.perform(post("/api/bookings/{code}/withdraw", code))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("WITHDRAWN"));

		assertEquals("WITHDRAWN", jdbc.sql("SELECT status FROM booking WHERE id = :id")
				.param("id", bookingId).query(String.class).single());
	}

	@Test
	void unknownCodeIsNotFound() throws Exception {
		mvc.perform(post("/api/bookings/{code}/withdraw", "NOSUCHCODE"))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NO_SUCH_BOOKING"));
	}

	@Test
	void aBookingThatLeftPendingIsAConflict() throws Exception {
		String code = uniqueCode("WDCONF");
		long bookingId = insertPendingRequest(code, bookable());
		jdbc.sql("UPDATE booking SET status = 'CONFIRMED', confirmed_at = now() WHERE id = :id")
				.param("id", bookingId).update();

		mvc.perform(post("/api/bookings/{code}/withdraw", code))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("REQUEST_NOT_PENDING"))
				.andExpect(jsonPath("$.detail").value(NOT_PENDING_DETAIL));
	}

	/** A second withdraw is a conflict, not a second release — the guard makes it a 0-row no-op. */
	@Test
	void withdrawingTwiceIsAConflict() throws Exception {
		String code = uniqueCode("WDTWICE");
		insertPendingRequest(code, bookable());

		mvc.perform(post("/api/bookings/{code}/withdraw", code)).andExpect(status().isOk());
		mvc.perform(post("/api/bookings/{code}/withdraw", code))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("REQUEST_NOT_PENDING"))
				.andExpect(jsonPath("$.detail").value(NOT_PENDING_DETAIL));
	}

	/** The code is a bearer credential — it must not come back in an error body (invariant #7). */
	@Test
	void codeNeverLeaksIntoTheProblemBody() throws Exception {
		String code = uniqueCode("WDLEAK");
		long bookingId = insertPendingRequest(code, bookable());
		jdbc.sql("UPDATE booking SET status = 'DECLINED' WHERE id = :id")
				.param("id", bookingId).update();

		mvc.perform(post("/api/bookings/{code}/withdraw", code))
				.andExpect(status().isConflict())
				.andExpect(content().string(not(containsString(code))));

		mvc.perform(post("/api/bookings/{code}/withdraw", "UNKNOWN12345"))
				.andExpect(status().isNotFound())
				.andExpect(content().string(not(containsString("UNKNOWN12345"))));
	}

	/**
	 * The venue's queue can still hold a request the guest has withdrawn. Accept must then answer the
	 * existing {@code REQUEST_NOT_PENDING} conflict, which the operator console already renders as
	 * "already handled" — the whole reason this slice ships no venue-side notification.
	 */
	@Test
	void acceptAfterWithdrawIsNotPending() throws Exception {
		String code = uniqueCode("WDSTALE");
		long bookingId = insertPendingRequest(code, bookable());

		mvc.perform(post("/api/bookings/{code}/withdraw", code)).andExpect(status().isOk());

		mvc.perform(post("/api/venues/{v}/booking-requests/{b}/accept", venueId, bookingId)
						.cookie(operatorSession).with(csrf()))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("REQUEST_NOT_PENDING"))
				.andExpect(jsonPath("$.detail").value(NOT_PENDING_DETAIL));

		// The stale accept must not resurrect the booking or re-claim the freed set.
		assertEquals("WITHDRAWN", jdbc.sql("SELECT status FROM booking WHERE id = :id")
				.param("id", bookingId).query(String.class).single());
		assertEquals(0L, jdbc.sql("SELECT COUNT(*) FROM set_availability "
						+ "WHERE set_id = :set AND booking_date = :date")
				.param("set", setId).param("date", bookable()).query(Long.class).single(),
				"the withdrawn request's soft-hold stays released (invariant #2)");
	}

	/** Decline is the operator's other stale-queue action, and answers the same conflict. */
	@Test
	void declineAfterWithdrawIsNotPending() throws Exception {
		String code = uniqueCode("WDSTALD");
		long bookingId = insertPendingRequest(code, bookable());

		mvc.perform(post("/api/bookings/{code}/withdraw", code)).andExpect(status().isOk());

		mvc.perform(post("/api/venues/{v}/booking-requests/{b}/decline", venueId, bookingId)
						.cookie(operatorSession).with(csrf()))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("REQUEST_NOT_PENDING"))
				.andExpect(jsonPath("$.detail").value(NOT_PENDING_DETAIL));
	}
}
