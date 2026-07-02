package ai.riviera.platform.booking;

import java.time.Duration;
import java.time.LocalDate;

import org.awaitility.Awaitility;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.jayway.jsonpath.JsonPath;

import ai.riviera.platform.CurrentOperator;
import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.operator.vocabulary.OperatorId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The Request-to-Book decision loop end-to-end (issue #98, AC-3/AC-4/AC-10) against real Postgres,
 * on the default stub profile (synchronous collection — the accept path's {@code Succeeded} leg):
 *
 * <ul>
 *   <li><strong>accept:</strong> request → queue shows it → accept → {@code CONFIRMED}, the payout
 *       ledger accrues <strong>exactly once</strong> (invariant #9, via the same
 *       {@code BookingConfirmed} spine as Instant Book), and a second accept/decline is rejected;</li>
 *   <li><strong>decline:</strong> request → decline → {@code DECLINED}, the availability row is
 *       released (the set is re-bookable), and the declined request can never be paid or confirmed
 *       — a later accept is {@code REQUEST_NOT_PENDING};</li>
 *   <li><strong>pay-on-accept credentials (AC-10):</strong> an {@code AWAITING_PAYMENT} booking
 *       with an open intent on record exposes {@code payment.clientSecret} on the code-gated view;
 *       a {@code PENDING_REQUEST} one exposes none.</li>
 * </ul>
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=test-operator-pw")
@AutoConfigureMockMvc
class RequestAcceptPayIT {

	private static final String OPERATOR = "operator";
	private static final String PASSWORD = "test-operator-pw";
	private static final Duration WAIT = Duration.ofSeconds(15);

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;

	/** Mock only the identity seam (as in CrossVenueDenialIT); ownership + flow are real. */
	@MockitoBean
	CurrentOperator currentOperator;

	private long venueId;
	private long setId;

	@BeforeEach
	void seedRequestVenueWithOwner() {
		venueId = jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES ('Accept Club', 'Accept Beach', 'Accept Region', 'REQUEST', 1500, 'EUR')
				RETURNING id
				""").query(Long.class).single();
		setId = jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:venue, 'A', 1, 'STANDARD', 'ONLINE', 4500, 'EUR', 1, 1)
				RETURNING id
				""").param("venue", venueId).query(Long.class).single();
		long operator = jdbc.sql("INSERT INTO operator (username, status, owns_all_venues) "
						+ "VALUES ('accept-op-' || :v, 'ACTIVE', FALSE) RETURNING id")
				.param("v", venueId).query(Long.class).single();
		jdbc.sql("INSERT INTO operator_venue (venue_id, operator_id) VALUES (:v, :o)")
				.param("v", venueId).param("o", operator).update();
		when(currentOperator.require(any())).thenReturn(new OperatorId(operator));
	}

	private String request(LocalDate date, String email) throws Exception {
		String body = """
				{"setId": %d, "bookingDate": "%s",
				 "contact": {"email": "%s", "fullName": "Req Guest", "phone": "+355600"}}
				""".formatted(setId, date, email);
		String response = mvc.perform(post("/api/bookings").contentType(MediaType.APPLICATION_JSON)
						.content(body))
				.andExpect(status().isAccepted())
				.andExpect(jsonPath("$.status").value("PENDING_REQUEST"))
				.andReturn().getResponse().getContentAsString();
		return JsonPath.read(response, "$.code");
	}

	private long bookingIdOf(String code) {
		return jdbc.sql("SELECT id FROM booking WHERE code = :code")
				.param("code", code).query(Long.class).single();
	}

	private long ledgerAccruals(long bookingId) {
		return jdbc.sql("SELECT COUNT(*) FROM payout_ledger_entry "
						+ "WHERE booking_id = :id AND entry_type = 'ACCRUAL'")
				.param("id", bookingId).query(Long.class).single();
	}

	@Test
	void acceptConfirmsAndAccruesExactlyOnce() throws Exception {
		LocalDate date = LocalDate.now().plusMonths(4);
		String code = request(date, "accept-loop@e.com");
		long bookingId = bookingIdOf(code);

		// The queue shows the pending request (no code in the payload).
		mvc.perform(get("/api/venues/{v}/booking-requests", venueId).with(httpBasic(OPERATOR, PASSWORD)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[0].bookingId").value(bookingId))
				.andExpect(jsonPath("$[0].guestName").value("Req Guest"))
				.andExpect(jsonPath("$[0].code").doesNotExist());

		// Accept: stub profile collects synchronously → CONFIRMED.
		mvc.perform(post("/api/venues/{v}/booking-requests/{b}/accept", venueId, bookingId)
						.with(httpBasic(OPERATOR, PASSWORD)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("CONFIRMED"));

		// The BookingConfirmed spine accrues the ledger exactly once (async AFTER_COMMIT).
		Awaitility.await().atMost(WAIT)
				.untilAsserted(() -> assertEquals(1, ledgerAccruals(bookingId)));
		Awaitility.await().during(Duration.ofSeconds(2)).atMost(WAIT)
				.untilAsserted(() -> assertEquals(1, ledgerAccruals(bookingId)));

		// A second decision on a decided request is rejected.
		mvc.perform(post("/api/venues/{v}/booking-requests/{b}/accept", venueId, bookingId)
						.with(httpBasic(OPERATOR, PASSWORD)))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("REQUEST_NOT_PENDING"));
		mvc.perform(post("/api/venues/{v}/booking-requests/{b}/decline", venueId, bookingId)
						.with(httpBasic(OPERATOR, PASSWORD)))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("REQUEST_NOT_PENDING"));
	}

	@Test
	void declineReleasesTheHoldTerminally() throws Exception {
		LocalDate date = LocalDate.now().plusMonths(5);
		String code = request(date, "decline-loop@e.com");
		long bookingId = bookingIdOf(code);

		mvc.perform(post("/api/venues/{v}/booking-requests/{b}/decline", venueId, bookingId)
						.with(httpBasic(OPERATOR, PASSWORD)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("DECLINED"));

		// Hold released: the availability row is gone and the set is bookable again.
		assertEquals(0L, jdbc.sql("SELECT COUNT(*) FROM set_availability "
						+ "WHERE set_id = :set AND booking_date = :date")
				.param("set", setId).param("date", date).query(Long.class).single());
		request(date, "decline-rebook@e.com"); // succeeds — 202 asserted inside

		// Terminal: a declined request can never be accepted (no payment path opens, AC-4).
		mvc.perform(post("/api/venues/{v}/booking-requests/{b}/accept", venueId, bookingId)
						.with(httpBasic(OPERATOR, PASSWORD)))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("REQUEST_NOT_PENDING"));

		// The guest view shows the terminal state, with no payment credentials.
		mvc.perform(get("/api/bookings/{code}", code))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("DECLINED"))
				.andExpect(jsonPath("$.payment").doesNotExist());
	}

	@Test
	void awaitingPaymentViewExposesStoredCredentialsOnly() throws Exception {
		// AC-10: simulate the post-accept Stripe state directly (the stripe profile is not active
		// here): an AWAITING_PAYMENT booking whose payment row carries a stored client_secret (V19).
		LocalDate date = LocalDate.now().plusMonths(6);
		String code = request(date, "credentials@e.com");
		long bookingId = bookingIdOf(code);
		jdbc.sql("UPDATE booking SET status = 'AWAITING_PAYMENT', accepted_at = NOW() WHERE id = :id")
				.param("id", bookingId).update();
		jdbc.sql("""
				INSERT INTO payment (booking_ref, payment_intent_id, amount_minor, currency, status,
				                     client_secret)
				VALUES (:ref, 'pi_accept_it', 4500, 'EUR', 'REQUIRES_PAYMENT', 'cs_accept_it_secret')
				""").param("ref", bookingId).update();

		mvc.perform(get("/api/bookings/{code}", code))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("AWAITING_PAYMENT"))
				.andExpect(jsonPath("$.payment.clientSecret").value("cs_accept_it_secret"))
				.andExpect(jsonPath("$.payment.paymentIntentId").value("pi_accept_it"));

		// Once no longer payable (succeeded), the credentials disappear from the view.
		jdbc.sql("UPDATE payment SET status = 'SUCCEEDED' WHERE booking_ref = :ref")
				.param("ref", bookingId).update();
		mvc.perform(get("/api/bookings/{code}", code))
				.andExpect(jsonPath("$.payment").doesNotExist());
	}

	@Test
	void pendingRequestViewExposesDeadlineButNoCredentials() throws Exception {
		LocalDate date = LocalDate.now().plusMonths(7);
		String code = request(date, "pending-view@e.com");

		mvc.perform(get("/api/bookings/{code}", code))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("PENDING_REQUEST"))
				.andExpect(jsonPath("$.requestExpiresAt").isNotEmpty())
				.andExpect(jsonPath("$.payment").doesNotExist())
				.andExpect(jsonPath("$.cancellable").value(false));
	}
}
