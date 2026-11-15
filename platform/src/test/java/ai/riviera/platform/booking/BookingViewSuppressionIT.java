package ai.riviera.platform.booking;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Set;

import com.stripe.StripeClient;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.notification.application.EmailSuppressions;
import ai.riviera.platform.notification.application.SuppressionReason;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The confirmation-mail disclosure on the wire (#390, #1748), end-to-end through the <strong>real</strong> chain: the
 * session principal → {@code customer.api.CustomerAccountDirectory}'s verified-owner check →
 * {@code booking.spi.ConfirmationMailDelivery} → the peppered-HMAC {@code email_suppression} read, out of
 * {@code GET /api/bookings/{code}}. Catches a wiring break, a pepper mismatch, a dropped {@code Emails.normalize} (the
 * owner case writes and reads different forms of one address) or a reader who is not the address's verified owner
 * learning anything (OWASP WSTG-IDNT-04).
 *
 * <p><strong>Runs under the {@code stripe} profile</strong>: only there does {@code payment.api.CollectionGuarantee}
 * answer {@code true}, the rule's first gate. Bookings are seeded by SQL; {@link StripeClient} is mocked.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("stripe")
@TestPropertySource(properties = {"stripe.api-key=sk_test_dummy", "stripe.webhook-secret=whsec_test"})
class BookingViewSuppressionIT {

	// A distinctive far-future date, purely so these rows are easy to tell apart from sibling ITs
	// sharing the Testcontainers context. (No availability row is written here, and booking's
	// (set_id, booking_date) index is deliberately non-unique per V5 — so nothing about this seed
	// touches invariant #2; each call also creates its own venue + set.)
	private static final LocalDate UNIQUE_DATE = LocalDate.of(2035, 7, 7);

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	EmailSuppressions suppressions;

	@MockitoBean
	StripeClient stripeClient;

	private static final ObjectMapper MAPPER = JsonMapper.builder().build();

	@Test
	void aGuestReadsTheSameMailFieldForASuppressedAndADeliverableAddress() throws Exception {
		suppressions.suppress("guest-suppressed@example.com", SuppressionReason.HARD_BOUNCE, Instant.now());
		String suppressed = seedBooking("VIEWGUEST1", "guest-suppressed@example.com", "CONFIRMED", null);
		String deliverable = seedBooking("VIEWGUEST2", "guest-deliverable@example.com", "CONFIRMED", null);

		JsonNode suppressedBody = read(get("/api/bookings/{code}", suppressed));
		JsonNode deliverableBody = read(get("/api/bookings/{code}", deliverable));

		assertEquals(Set.copyOf(deliverableBody.propertyNames()), Set.copyOf(suppressedBody.propertyNames()));
		assertEquals("UNDISCLOSED", suppressedBody.get("confirmationMail").asText());
		assertEquals(deliverableBody.get("confirmationMail"), suppressedBody.get("confirmationMail"));
	}

	@Test
	void theVerifiedOwnerIsToldTheMailWasWithheld() throws Exception {
		// Mismatched forms on every side, so a dropped Emails.normalize on any of them fails this test.
		suppressions.suppress("  Owner-Suppressed@Example.COM ", SuppressionReason.HARD_BOUNCE, Instant.now());
		long account = seedAccount("owner-suppressed@example.com", true);
		String code = seedBooking("VIEWOWNER1", " OWNER-suppressed@example.com", "CONFIRMED", account);

		mvc.perform(get("/api/bookings/{code}", code).with(customer("Owner-Suppressed@example.com")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.confirmationMail").value("WITHHELD"));
	}

	@Test
	void theVerifiedOwnerOfADeliverableAddressIsToldItWasEmailed() throws Exception {
		long account = seedAccount("owner-deliverable@example.com", true);
		String code = seedBooking("VIEWOWNER2", "owner-deliverable@example.com", "CONFIRMED", account);

		mvc.perform(get("/api/bookings/{code}", code).with(customer("owner-deliverable@example.com")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.confirmationMail").value("EMAILED"));
	}

	@Test
	void anAttackerBookingAVictimsAddressUnderTheirOwnAccountLearnsNothing() throws Exception {
		suppressions.suppress("victim@example.com", SuppressionReason.HARD_BOUNCE, Instant.now());
		long attacker = seedAccount("attacker@example.com", true);
		String code = seedBooking("VIEWATTACK1", "victim@example.com", "CONFIRMED", attacker);

		mvc.perform(get("/api/bookings/{code}", code).with(customer("attacker@example.com")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.confirmationMail").value("UNDISCLOSED"));
	}

	@Test
	void anUnverifiedAccountUnderTheVictimsAddressLearnsNothing() throws Exception {
		suppressions.suppress("victim-unverified@example.com", SuppressionReason.HARD_BOUNCE, Instant.now());
		long squatter = seedAccount("victim-unverified@example.com", false);
		String code = seedBooking("VIEWATTACK2", "victim-unverified@example.com", "CONFIRMED", squatter);

		mvc.perform(get("/api/bookings/{code}", code).with(customer("victim-unverified@example.com")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.confirmationMail").value("UNDISCLOSED"));
	}

	@Test
	void anAwaitingPaymentBookingNeverDisclosesMailSuppression() throws Exception {
		// The D-8 boundary: the 202 create hands out the code BEFORE the card is collected, even to the owner.
		String suppressed = "suppressed-awaiting@example.com";
		suppressions.suppress(suppressed, SuppressionReason.HARD_BOUNCE, Instant.now());
		long account = seedAccount(suppressed, true);
		String code = seedBooking("VIEWAWAIT1", suppressed, "AWAITING_PAYMENT", account);

		mvc.perform(get("/api/bookings/{code}", code).with(customer(suppressed)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("AWAITING_PAYMENT"))
				.andExpect(jsonPath("$.confirmationMail").value("UNDISCLOSED"));
	}

	private static RequestPostProcessor customer(String email) {
		return user(email).roles("CUSTOMER");
	}

	private JsonNode read(MockHttpServletRequestBuilder request) throws Exception {
		return MAPPER.readTree(mvc.perform(request).andExpect(status().isOk()).andReturn().getResponse()
				.getContentAsString());
	}

	private long seedAccount(String email, boolean verified) {
		return jdbc.sql("INSERT INTO customer_account (email, password_hash, email_verified) "
						+ "VALUES (:e, '{bcrypt}x', :v) RETURNING id")
				.param("e", email).param("v", verified).query(Long.class).single();
	}

	/** A booking on its own freshly-created venue + set, so no sibling IT can observe or collide. */
	private String seedBooking(String code, String email, String status, Long accountId) {
		long venueId = jdbc.sql("""
				INSERT INTO venue (name, beach, booking_mode, commission_bps, payout_currency)
				VALUES ('Suppression Club ' || :code, 'KSAMIL', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""").param("code", code).query(Long.class).single();
		long setId = jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:venue, 'A', 1, 'STANDARD', 'ONLINE', 4500, 'EUR', 1, 1)
				RETURNING id
				""").param("venue", venueId).query(Long.class).single();
		long customerId = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:email, 'Suppression Guest', '+355600') RETURNING id")
				.param("email", email).query(Long.class).single();
		jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, account_id, booking_date,
				                     amount_minor, amount_currency, status, confirmed_at)
				VALUES (:code, :venue, :set, :cust, :account, :date, 4500, 'EUR', :status, NOW())
				""")
				.param("code", code).param("venue", venueId).param("set", setId)
				.param("cust", customerId).param("account", accountId, java.sql.Types.BIGINT)
				.param("date", UNIQUE_DATE).param("status", status)
				.update();
		return code;
	}
}
