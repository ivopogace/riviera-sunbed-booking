package ai.riviera.platform.payout;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;

import jakarta.servlet.http.Cookie;

import org.junit.jupiter.api.BeforeEach;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.SessionLoginSupport;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.operator.api.OperatorProvisioning;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The admin's view of venue-caused refunds: one row per venue with how many bookings a remodel
 * refunded, what they returned to guests, and what the venue paid in fees — built from ledger rows
 * nobody can forget to write, which is what makes it the abuse guard rather than a report someone
 * maintains by hand.
 *
 * <p>The two figures come from different entry types and must never be added together: the refunded
 * amount is the {@code REVERSAL}'s gross (what the guest got back), the fee total is the
 * {@code FEE}'s net (what the venue paid). Aggregates only — no booking id, no code (invariant #7).
 * Platform-admin gated, and exempt from per-venue ownership because it belongs to no venue
 * (invariant #13).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=venue-change-admin-pw")
@AutoConfigureMockMvc
class AdminVenueChangeRefundsIT {

	private static final String PATH = "/api/admin/venue-change-refunds";
	private static final String ADMIN = "operator";
	private static final String ADMIN_PW = "venue-change-admin-pw";
	private static final String PLAIN_OPERATOR = "venue-change-plain-op";
	private static final String PLAIN_OPERATOR_PW = "plain-op-pw-123";

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	OperatorProvisioning provisioning;

	@Autowired
	PasswordEncoder encoder;

	@BeforeEach
	void setUp() {
		jdbc.sql("DELETE FROM operator WHERE username = :u").param("u", PLAIN_OPERATOR).update();
		provisioning.provision(PLAIN_OPERATOR, encoder.encode(PLAIN_OPERATOR_PW));
	}

	private Cookie adminSession() throws Exception {
		return SessionLoginSupport.operatorSession(mvc, ADMIN, ADMIN_PW);
	}

	private Cookie plainOperatorSession() throws Exception {
		return SessionLoginSupport.operatorSession(mvc, PLAIN_OPERATOR, PLAIN_OPERATOR_PW);
	}

	private long newVenue(String name) {
		return jdbc.sql("""
				INSERT INTO venue (name, beach, region, description, booking_mode, payout_currency,
				                   commission_bps)
				VALUES (:n, 'Ksamil', 'Riviera', 'x', 'INSTANT', 'EUR', 1500)
				RETURNING id
				""").param("n", name + " " + System.nanoTime()).query(Long.class).single();
	}

	private long newBooking(long venueId, String code) {
		long set = jdbc.sql("SELECT id FROM set_position ORDER BY id LIMIT 1").query(Long.class).single();
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status)
				VALUES (:code, :venue, :set, :cust, :date, 10000, 'EUR', 'CONFIRMED')
				RETURNING id
				""")
				.param("code", code).param("venue", venueId).param("set", set)
				.param("cust", customer).param("date", LocalDate.of(2032, 6, 1))
				.query(Long.class).single();
	}

	private void entry(long venueId, long bookingId, String type, long gross, long commission, long net,
			String reason) {
		jdbc.sql("""
				INSERT INTO payout_ledger_entry (venue_id, booking_id, entry_type, gross_minor,
				                                 commission_minor, net_minor, currency, reason)
				VALUES (:v, :b, :type, :gross, :commission, :net, 'EUR', :reason)
				""")
				.param("v", venueId).param("b", bookingId).param("type", type).param("gross", gross)
				.param("commission", commission).param("net", net).param("reason", reason)
				.update();
	}

	@Test
	void listsVenueCausedRefundsPerVenueWithCountAmountAndFee() throws Exception {
		long busy = newVenue("Remodelling Club");
		long quiet = newVenue("Settled Club");
		long first = newBooking(busy, "VCR-" + System.nanoTime());
		long second = newBooking(busy, "VCR-" + System.nanoTime());
		long policy = newBooking(busy, "VCR-" + System.nanoTime());
		long other = newBooking(quiet, "VCR-" + System.nanoTime());
		entry(busy, first, "REVERSAL", 10000, 1500, 8500, "VENUE_CHANGE");
		entry(busy, first, "FEE", 0, 0, 500, "VENUE_CHANGE");
		entry(busy, second, "REVERSAL", 4000, 600, 3400, "VENUE_CHANGE");
		entry(busy, second, "FEE", 0, 0, 500, "VENUE_CHANGE");
		entry(busy, policy, "REVERSAL", 9000, 1350, 7650, "POLICY");
		entry(quiet, other, "REVERSAL", 2000, 300, 1700, "VENUE_CHANGE");
		entry(quiet, other, "FEE", 0, 0, 500, "VENUE_CHANGE");

		mvc.perform(get(PATH).cookie(adminSession()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.venues[?(@.venueId == %d)].refundCount".formatted(busy)).value(2))
				.andExpect(jsonPath("$.venues[?(@.venueId == %d)].refundedMinor".formatted(busy)).value(14000))
				.andExpect(jsonPath("$.venues[?(@.venueId == %d)].feeMinor".formatted(busy)).value(1000))
				.andExpect(jsonPath("$.venues[?(@.venueId == %d)].currency".formatted(busy)).value("EUR"))
				.andExpect(jsonPath("$.venues[?(@.venueId == %d)].refundCount".formatted(quiet)).value(1))
				.andExpect(jsonPath("$.venues[?(@.venueId == %d)].refundedMinor".formatted(quiet)).value(2000))
				.andExpect(jsonPath("$.venues[?(@.venueId == %d)].feeMinor".formatted(quiet)).value(500));
	}

	@Test
	void aVenueWhoseOnlyRefundsArePolicyIsNotListed() throws Exception {
		long venue = newVenue("Policy Only Club");
		long booking = newBooking(venue, "VCR-" + System.nanoTime());
		entry(venue, booking, "REVERSAL", 9000, 1350, 7650, "POLICY");

		mvc.perform(get(PATH).cookie(adminSession()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.venues[?(@.venueId == %d)]".formatted(venue)).isEmpty());
	}

	@Test
	void aNonAdminOperatorIsForbidden() throws Exception {
		mvc.perform(get(PATH).cookie(plainOperatorSession()))
				.andExpect(status().isForbidden());
	}
}
