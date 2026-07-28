package ai.riviera.platform.booking;

import java.time.Instant;
import java.time.LocalDate;

import com.stripe.StripeClient;

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

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.notification.application.EmailSuppressions;
import ai.riviera.platform.notification.application.SuppressionReason;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The withheld-confirmation-mail flag on the wire (#390), end-to-end through the <strong>real</strong>
 * chain: {@code booking.spi.ConfirmationMailDelivery} → {@code notification}'s adapter →
 * {@code customer.api.CustomerLookup} → the peppered-HMAC {@code email_suppression} read, and out of
 * {@code GET /api/bookings/{code}} under its published field name. Every unit test on this path mocks
 * the seam it proves, so this is what actually catches a wiring break, a pepper/normalization
 * mismatch, or a rename of the record component.
 *
 * <p><strong>Runs under the {@code stripe} profile deliberately</strong> — that is the gate. Without
 * it the in-process stub gateway makes {@code CONFIRMED} reachable with nothing collected, so
 * {@code NonDisclosingConfirmationMailDelivery} answers and the flag is always {@code false}
 * (`ConfirmationMailDeliveryProfileWiringTest` pins that half). Bookings are seeded by SQL rather than
 * through the API, so the profile's {@code 202} create path is irrelevant here; {@link StripeClient}
 * is mocked, so no live Stripe call is made.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("stripe")
@TestPropertySource(properties = {"stripe.api-key=sk_test_dummy", "stripe.webhook-secret=whsec_test"})
class BookingViewSuppressionIT {

	// A distinctive far-future date so this (set, date) can never collide with a sibling IT sharing
	// the Testcontainers context (invariant #2 would otherwise reject the seed).
	private static final LocalDate UNIQUE_DATE = LocalDate.of(2035, 7, 7);

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	EmailSuppressions suppressions;

	@MockitoBean
	StripeClient stripeClient;

	@Test
	void confirmedBookingReportsAWithheldConfirmationMailForASuppressedGuest() throws Exception {
		String suppressed = "suppressed-view@example.com";
		suppressions.suppress(suppressed, SuppressionReason.HARD_BOUNCE, Instant.now());
		String code = seedBooking("VIEWSUPP1", suppressed, "CONFIRMED");

		mvc.perform(get("/api/bookings/{code}", code))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("CONFIRMED"))
				.andExpect(jsonPath("$.emailWithheld").value(true));
	}

	@Test
	void confirmedBookingReportsNoWithheldMailForADeliverableGuest() throws Exception {
		String code = seedBooking("VIEWDELIV1", "deliverable-view@example.com", "CONFIRMED");

		mvc.perform(get("/api/bookings/{code}", code))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.emailWithheld").value(false));
	}

	@Test
	void anAwaitingPaymentBookingNeverDisclosesMailSuppression() throws Exception {
		// The D-8 boundary on the wire: the 202 create hands out the code BEFORE the card is
		// collected, so this read must report false for an address that IS suppressed — the port is
		// not consulted at all. A regression here is a suppression oracle for any address.
		String suppressed = "suppressed-awaiting@example.com";
		suppressions.suppress(suppressed, SuppressionReason.HARD_BOUNCE, Instant.now());
		String code = seedBooking("VIEWAWAIT1", suppressed, "AWAITING_PAYMENT");

		mvc.perform(get("/api/bookings/{code}", code))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("AWAITING_PAYMENT"))
				.andExpect(jsonPath("$.emailWithheld").value(false));
	}

	/** A booking on its own venue + set, so the (set, date) can never collide with a sibling IT. */
	private String seedBooking(String code, String email, String status) {
		long venueId = jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES ('Suppression Club ' || :code, 'Test Beach', 'Riviera', 'INSTANT', 1500, 'EUR')
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
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status, confirmed_at)
				VALUES (:code, :venue, :set, :cust, :date, 4500, 'EUR', :status, NOW())
				""")
				.param("code", code).param("venue", venueId).param("set", setId)
				.param("cust", customerId).param("date", UNIQUE_DATE).param("status", status)
				.update();
		return code;
	}
}
