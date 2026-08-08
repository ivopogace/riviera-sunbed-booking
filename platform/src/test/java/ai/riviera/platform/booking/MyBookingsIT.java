package ai.riviera.platform.booking;

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
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.SessionLoginSupport;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.customer.api.CustomerAccountProvisioning;
import ai.riviera.platform.operator.api.OperatorProvisioning;
import jakarta.servlet.http.Cookie;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * {@code GET /api/me/bookings} lists only the authenticated customer's account-linked
 * bookings, and is CUSTOMER-only. Proves AC-3 (cross-customer denial — customer A never sees B's
 * bookings, enforced by the {@code WHERE account_id = :account} scope, not a request param) and AC-4
 * (anonymous → 401, an operator session → 403, a customer → 200). Real security + Testcontainers;
 * skipped where Docker is absent. Each login rides a unique {@code X-Forwarded-For}.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class MyBookingsIT {

	private static final String SESSION_COOKIE = "SESSION";
	private static final String EMAIL_A = "mybk-a@example.com";
	private static final String EMAIL_B = "mybk-b@example.com";
	private static final String PASSWORD = "password123";
	private static final String OPERATOR_USERNAME = "mybk-op";
	private static final String OPERATOR_PASSWORD = "op-password";
	private static final String CODE_A = "MYBKMINEA01";
	private static final String CODE_B = "MYBKOTHERB1";

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;
	@Autowired
	CustomerAccountProvisioning customerProvisioning;
	@Autowired
	OperatorProvisioning operatorProvisioning;
	@Autowired
	PasswordEncoder encoder;

	private record SetRef(long setId, long venueId) {
	}

	@BeforeEach
	void seed() {
		jdbc.sql("DELETE FROM booking WHERE code IN (:a, :b)").param("a", CODE_A).param("b", CODE_B).update();
		// The guest-contact rows insertBooking creates (FK from booking) — remove before the booking's
		// gone so a re-seed doesn't collide on customer_email_uniq. Bookings are deleted first (above).
		jdbc.sql("DELETE FROM customer WHERE email IN (:a, :b)")
				.param("a", CODE_A + "@example.com").param("b", CODE_B + "@example.com").update();
		jdbc.sql("DELETE FROM customer_account WHERE email IN (:a, :b)").param("a", EMAIL_A).param("b", EMAIL_B).update();
		jdbc.sql("DELETE FROM operator_venue WHERE operator_id IN "
				+ "(SELECT id FROM operator WHERE username = :u)").param("u", OPERATOR_USERNAME).update();
		jdbc.sql("DELETE FROM operator WHERE username = :u").param("u", OPERATOR_USERNAME).update();

		customerProvisioning.register(EMAIL_A, encoder.encode(PASSWORD));
		customerProvisioning.register(EMAIL_B, encoder.encode(PASSWORD));
		operatorProvisioning.provision(OPERATOR_USERNAME, encoder.encode(OPERATOR_PASSWORD));

		SetRef set = onlineSet();
		insertBooking(CODE_A, set, accountId(EMAIL_A));
		insertBooking(CODE_B, set, accountId(EMAIL_B));
	}

	@Test
	void listsOnlyTheAuthenticatedCustomersBookings() throws Exception {
		Cookie session = customerLogin(EMAIL_A);

		// AC-3 + AC-4 (customer): A's own booking is listed; B's booking (same set, other account) is not.
		mvc.perform(get("/api/me/bookings").cookie(session))
				.andExpect(status().isOk())
				.andExpect(content().string(containsString(CODE_A)))
				.andExpect(content().string(not(containsString(CODE_B))));
	}

	@Test
	void anonymousIsUnauthorized() throws Exception {
		mvc.perform(get("/api/me/bookings")).andExpect(status().isUnauthorized());
	}

	@Test
	void operatorSessionIsForbidden() throws Exception {
		Cookie operator = SessionLoginSupport.operatorSession(mvc, OPERATOR_USERNAME, OPERATOR_PASSWORD);
		mvc.perform(get("/api/me/bookings").cookie(operator)).andExpect(status().isForbidden());
	}

	private SetRef onlineSet() {
		return jdbc.sql("SELECT id, venue_id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1")
				.query((rs, n) -> new SetRef(rs.getLong("id"), rs.getLong("venue_id"))).single();
	}

	private long accountId(String email) {
		return jdbc.sql("SELECT id FROM customer_account WHERE email = :e").param("e", email)
				.query(Long.class).single();
	}

	private void insertBooking(String code, SetRef set, long accountId) {
		long guest = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, account_id, booking_date,
				                     amount_minor, amount_currency, status)
				VALUES (:code, :venue, :set, :cust, :account, :date, 4500, 'EUR', 'CONFIRMED')
				""")
				.param("code", code).param("venue", set.venueId()).param("set", set.setId())
				.param("cust", guest).param("account", accountId).param("date", LocalDate.of(2027, 8, 20))
				.update();
	}

	private Cookie customerLogin(String email) throws Exception {
		Cookie session = mvc.perform(post("/api/auth/customer/login").with(csrf())
						.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"email": "%s", "password": "%s"}""".formatted(email, PASSWORD)))
				.andExpect(status().isOk())
				.andReturn().getResponse().getCookie(SESSION_COOKIE);
		if (session == null) {
			throw new IllegalStateException("customer login must establish a session cookie");
		}
		return session;
	}
}
