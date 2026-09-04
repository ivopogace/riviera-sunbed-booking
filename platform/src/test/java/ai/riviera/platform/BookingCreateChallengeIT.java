package ai.riviera.platform;

import java.time.Instant;
import java.time.LocalDate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import ai.riviera.platform.challenge.ChallengeSolving;
import ai.riviera.platform.customer.api.CustomerAccountProvisioning;

import jakarta.servlet.http.Cookie;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The proof-of-work fence on {@code POST /api/bookings}, end to end against real Postgres: a
 * challenge minted by the endpoint and solved with the library books the set for a guest and for a
 * signed-in customer alike — the fence has no auth-state branch — while a missing, forged, expired
 * or replayed solution is refused with its code, claims no availability and writes no booking and no
 * payment. A refusal still spends the per-IP create budget, with the rate limiter winning once that
 * runs out.
 *
 * <p>Each test books its own throwaway venue's set on its own far-future date, so no case can be
 * decided by a neighbour's claim, and every request presents a unique client IP except the one that
 * deliberately pins a budget. Its own context: a tiny cost keeps the Java solves instant and a known
 * secret lets the test mint an expired challenge.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = { "riviera.operator.password=test-operator-pw",
		"booking.no-show.enabled=false" })
@AutoConfigureMockMvc
@TestPropertySource(properties = {
		"riviera.altcha.cost=10",
		"riviera.altcha.hmac-secret=" + BookingCreateChallengeIT.SECRET,
})
class BookingCreateChallengeIT {

	static final String SECRET = "booking-create-it-only-not-a-secret";
	private static final String CREATE_PATH = "/api/bookings";
	private static final String CHALLENGE_PATH = "/api/auth/challenge";
	private static final String HEADER = "X-Altcha-Payload";
	private static final int COST = 10;
	/** The shipped {@code riviera.ratelimit.per-ip.capacity}, which the create route rides. */
	private static final int PER_IP_BUDGET = 120;
	private static final String ACCOUNT_EMAIL = "chal-booking-account@example.com";
	private static final String ACCOUNT_PASSWORD = "chal-booking-passphrase-1";
	private static final String VENUE_MARKER = "Challenge Fence Club";
	private static final String GUEST_EMAIL_DOMAIN = "@chal-booking.example";

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;
	@Autowired
	CustomerAccountProvisioning customerProvisioning;
	@Autowired
	PasswordEncoder encoder;

	private long setId;
	private LocalDate date;

	/**
	 * Nothing is deleted between tests: each books a brand-new venue's set, so no case can be
	 * decided by a neighbour's claim and no confirmed booking has to be unwound past the payout
	 * ledger it accrued (invariant #9). Registration is idempotent on the email, so the shared
	 * account survives a re-run with its first hash — which still verifies this password.
	 */
	@BeforeEach
	void seed() {
		customerProvisioning.register(ACCOUNT_EMAIL, encoder.encode(ACCOUNT_PASSWORD));
		setId = freshOnlineSet();
		date = LocalDate.now().plusYears(2);
	}

	@Test
	void createsAGuestBookingWithASolvedChallenge() throws Exception {
		create(null, solvedFromTheEndpoint(), "alice")
				.andExpect(status().is2xxSuccessful())
				.andExpect(jsonPath("$.code").isNotEmpty());

		assertEquals(1, bookings());
		assertEquals(1, availabilityRows());
	}

	@Test
	void createsASignedInCustomerBookingWithASolvedChallenge() throws Exception {
		create(customerSession(), solvedFromTheEndpoint(), "bob")
				.andExpect(status().is2xxSuccessful())
				.andExpect(jsonPath("$.code").isNotEmpty());

		assertEquals(1, bookings());
		assertEquals(1, availabilityRows());
	}

	@Test
	void rejectsAMissingHeader() throws Exception {
		create(null, null, "carol")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("CHALLENGE_REQUIRED"));
	}

	@Test
	void rejectsAMissingHeaderFromASignedInCustomerToo() throws Exception {
		create(customerSession(), null, "dana")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("CHALLENGE_REQUIRED"));
	}

	@Test
	void rejectsAForgedSignature() throws Exception {
		create(null, ChallengeSolving.tamperSignature(solvedFromTheEndpoint()), "erin")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("CHALLENGE_INVALID"));
	}

	@Test
	void rejectsAWrongAnswer() throws Exception {
		create(null, ChallengeSolving.wrongAnswer(solvedFromTheEndpoint()), "frank")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("CHALLENGE_INVALID"));
	}

	@Test
	void rejectsAnExpiredChallenge() throws Exception {
		long aMinuteAgo = Instant.now().minusSeconds(60).getEpochSecond();
		String payload = ChallengeSolving.solve(ChallengeSolving.mint(SECRET, COST, aMinuteAgo));

		create(null, payload, "gina")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("CHALLENGE_EXPIRED"));
	}

	@Test
	void rejectsAReplayedSolution() throws Exception {
		String payload = solvedFromTheEndpoint();
		create(null, payload, "hank").andExpect(status().is2xxSuccessful());

		setId = freshOnlineSet();
		create(null, payload, "hank-two")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("CHALLENGE_EXPIRED"));

		assertEquals(0, availabilityRows());
	}

	@Test
	void aRefusalClaimsNoAvailabilityAndWritesNoBookingOrPayment() throws Exception {
		long paymentsBefore = payments();

		create(null, null, "iris").andExpect(status().isBadRequest());
		create(null, ChallengeSolving.tamperSignature(solvedFromTheEndpoint()), "iris")
				.andExpect(status().isBadRequest());

		assertEquals(0, availabilityRows());
		assertEquals(0, bookings());
		assertEquals(paymentsBefore, payments());
	}

	@Test
	void aChallengeFailureStillSpendsThePerIpCreateBudget() throws Exception {
		String ip = SessionLoginSupport.uniqueClientIp();
		for (int i = 0; i < PER_IP_BUDGET; i++) {
			createFrom(ip, null, null, "jane")
					.andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.code").value("CHALLENGE_REQUIRED"));
		}

		createFrom(ip, null, null, "jane")
				.andExpect(status().isTooManyRequests())
				.andExpect(jsonPath("$.code").value("RATE_LIMITED"));
	}

	private String solvedFromTheEndpoint() throws Exception {
		MvcResult result = mvc.perform(get(CHALLENGE_PATH)
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp()))
				.andExpect(status().isOk())
				.andReturn();
		return ChallengeSolving.solve(result.getResponse().getContentAsString());
	}

	private Cookie customerSession() throws Exception {
		MvcResult result = mvc.perform(SessionLoginSupport.loginRequest("/api/auth/customer/login",
				"""
						{"email": "%s", "password": "%s"}""".formatted(ACCOUNT_EMAIL, ACCOUNT_PASSWORD))
				.with(csrf()))
				.andExpect(status().isOk())
				.andReturn();
		Cookie session = result.getResponse().getCookie("SESSION");
		if (session == null) {
			throw new IllegalStateException("customer login must establish a session cookie");
		}
		return session;
	}

	/** A throwaway Instant-Book venue with one ONLINE set, so no other test's claim can decide a case. */
	private long freshOnlineSet() {
		long venue = jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency, sales_close)
				VALUES (:name, 'Fence Beach', 'Fence Region', 'INSTANT', 1500, 'EUR', TIME '23:59')
				RETURNING id
				""")
				.param("name", VENUE_MARKER + " " + SessionLoginSupport.uniqueClientIp())
				.query(Long.class).single();
		long operator = jdbc.sql("INSERT INTO operator (username, status) "
						+ "VALUES ('chal-booking-op-' || :v, 'ACTIVE') RETURNING id")
				.param("v", venue).query(Long.class).single();
		jdbc.sql("INSERT INTO operator_venue (venue_id, operator_id) VALUES (:v, :o)")
				.param("v", venue).param("o", operator).update();
		return jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:venue, 'A', 1, 'STANDARD', 'ONLINE', 4500, 'EUR', 1, 1)
				RETURNING id
				""")
				.param("venue", venue).query(Long.class).single();
	}

	private int availabilityRows() {
		return jdbc.sql("SELECT count(*) FROM set_availability WHERE set_id = :s AND booking_date = :d")
				.param("s", setId).param("d", date).query(Integer.class).single();
	}

	private int bookings() {
		return jdbc.sql("SELECT count(*) FROM booking WHERE set_id = :s AND booking_date = :d")
				.param("s", setId).param("d", date).query(Integer.class).single();
	}

	private long payments() {
		return jdbc.sql("SELECT count(*) FROM payment").query(Long.class).single();
	}

	private ResultActions create(Cookie session, String payload, String guest) throws Exception {
		return createFrom(SessionLoginSupport.uniqueClientIp(), session, payload, guest);
	}

	private ResultActions createFrom(String ip, Cookie session, String payload, String guest) throws Exception {
		MockHttpServletRequestBuilder request = post(CREATE_PATH).with(csrf())
				.header("X-Forwarded-For", ip)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"setId": %d, "bookingDate": "%s",
						 "contact": {"email": "%s-%d%s", "fullName": "Fence Guest", "phone": "+355699"}}"""
						.formatted(setId, date, guest, setId, GUEST_EMAIL_DOMAIN));
		if (payload != null) {
			request.header(HEADER, payload);
		}
		if (session != null) {
			request.cookie(session);
		}
		return mvc.perform(request);
	}
}
