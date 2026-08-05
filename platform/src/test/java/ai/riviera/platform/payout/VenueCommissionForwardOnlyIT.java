package ai.riviera.platform.payout;

import java.time.LocalDate;
import java.time.ZoneId;

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
import ai.riviera.platform.operator.api.OperatorProvisioning;
import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.VenueRef;

import jakarta.servlet.http.Cookie;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The invariant-#9 claim of A7 (epic #348), end to end and from the money side: <strong>a commission
 * rate change is forward-only.</strong> An existing payout-ledger accrual keeps its
 * {@code commission_minor}, and the operator console's takings strip for that already-sold service
 * date keeps agreeing with it — instead of silently re-splitting the day at the new rate, which is
 * what {@code DailyTakingsService} did before this slice.
 *
 * <p><strong>Why this test exists next to {@code DailyTakingsServiceTest}.</strong> That test proves
 * the service asks for the right rate, with a fake answering whatever it likes. This one proves the
 * whole chain produces a figure that matches what the venue was actually promised: a real rate write
 * through the admin surface, the real schedule, the real per-date read, and a real ledger row to
 * compare against. Neither alone would have caught a wrong effective date.
 *
 * <p>The ledger row is inserted directly rather than driven through a booking confirmation — the
 * accrual mechanics are {@code PayoutAccrualIT}'s subject, and reproducing them here would test the
 * spine twice while obscuring what this test is about. What matters is that a row recorded at the old
 * rate is still there, untouched, afterwards.
 *
 * <p>Runs only when Docker is available; CI runs it.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=test-operator-pw")
@AutoConfigureMockMvc
class VenueCommissionForwardOnlyIT {

	private static final String ADMIN = "operator"; // the bootstrap account, the platform admin (V29)
	private static final String ADMIN_PW = "test-operator-pw";
	private static final String OWNER = "forward-only-owner";
	private static final String OWNER_PW = "owner-pw";
	/**
	 * Invariant #6: a service date is a civil date in this zone. The service computes "tomorrow" in
	 * Tirane off a UTC clock, so a test reckoning it in the JVM default zone disagrees for the ~2 hours
	 * each evening when Tirane has already rolled over and UTC has not — the assertion would then
	 * demand the new rate for a date the schedule correctly still governs at the old one.
	 */
	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	private static final int OLD_BPS = 1500;
	private static final int NEW_BPS = 2500;
	private static final long GROSS_MINOR = 11_000L;
	/** Σ gross × 1500 bps, floor-divided (invariant #5) — what the accrual recorded. */
	private static final long OLD_COMMISSION = 1_650L;

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;
	@Autowired
	OperatorProvisioning provisioning;
	@Autowired
	VenueOwnership ownership;
	@Autowired
	PasswordEncoder encoder;

	@BeforeEach
	void provisionTheOwner() {
		jdbc.sql("DELETE FROM operator_venue WHERE operator_id IN "
				+ "(SELECT id FROM operator WHERE username = :u)").param("u", OWNER).update();
		jdbc.sql("DELETE FROM operator WHERE username = :u").param("u", OWNER).update();
		provisioning.provision(OWNER, encoder.encode(OWNER_PW));
	}

	@Test
	void aRateChangeDoesNotResplitPastServiceDatesNorTouchTheLedger() throws Exception {
		LocalDate soldOn = LocalDate.now(TIRANE).minusDays(3);
		long venueId = ownedVenue();
		long bookingId = confirmedBooking(venueId, soldOn);
		accrue(venueId, bookingId);

		raiseTheRate(venueId);

		// The strip for the already-sold day still splits at the rate it was sold at...
		mvc.perform(get("/api/venues/{v}/takings", venueId)
						.param("date", soldOn.toString())
						.cookie(ownerSession()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.commissionBps").value(OLD_BPS))
				.andExpect(jsonPath("$.gross.minorUnits").value(GROSS_MINOR))
				.andExpect(jsonPath("$.net.minorUnits").value(GROSS_MINOR - OLD_COMMISSION));

		// ...and the ledger entry behind it is byte-identical (invariant #9: never repriced).
		assertThat(ledgerCommission(bookingId))
				.as("a rate change must not reach an accrual that already happened")
				.isEqualTo(OLD_COMMISSION);
	}

	@Test
	void theNewRateGovernsServiceDatesFromTomorrowOnward() throws Exception {
		LocalDate tomorrow = LocalDate.now(TIRANE).plusDays(1);
		long venueId = ownedVenue();

		raiseTheRate(venueId);

		mvc.perform(get("/api/venues/{v}/takings", venueId)
						.param("date", tomorrow.toString())
						.cookie(ownerSession()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.commissionBps").value(NEW_BPS));
	}

	private void raiseTheRate(long venueId) throws Exception {
		mvc.perform(put("/api/admin/venues/{v}/commission", venueId)
						.cookie(SessionLoginSupport.operatorSession(mvc, ADMIN, ADMIN_PW))
						.with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"commissionBps\":%d}".formatted(NEW_BPS)))
				.andExpect(status().isOk());
	}

	private Cookie ownerSession() throws Exception {
		return SessionLoginSupport.operatorSession(mvc, OWNER, OWNER_PW);
	}

	private long ownedVenue() {
		long id = jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES ('A7 Forward-Only Venue', 'Test Beach', 'Test Region', 'INSTANT', :bps, 'EUR')
				RETURNING id
				""")
				.param("bps", OLD_BPS)
				.query(Long.class)
				.single();
		long operatorId = jdbc.sql("SELECT id FROM operator WHERE username = :u")
				.param("u", OWNER).query(Long.class).single();
		ownership.assignOwner(new OperatorId(operatorId), new VenueRef(id));
		return id;
	}

	private long confirmedBooking(long venueId, LocalDate serviceDate) {
		long setId = jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool,
				                          price_minor, price_currency, grid_x, grid_y)
				VALUES (:venue, 'A', 1, 'STANDARD', 'ONLINE', :price, 'EUR', 1, 1)
				RETURNING id
				""")
				.param("venue", venueId)
				.param("price", GROSS_MINOR)
				.query(Long.class)
				.single();
		long customerId = jdbc.sql("""
				INSERT INTO customer (full_name, email, phone)
				VALUES ('A7 Guest', 'a7-forward-only@example.test', '+355690000000')
				RETURNING id
				""")
				.query(Long.class)
				.single();
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status, confirmed_at)
				VALUES (:code, :venue, :set, :customer, :date, :amount, 'EUR', 'CONFIRMED', NOW())
				RETURNING id
				""")
				.param("code", "A7FWD" + serviceDate.toEpochDay())
				.param("venue", venueId)
				.param("set", setId)
				.param("customer", customerId)
				.param("date", serviceDate)
				.param("amount", GROSS_MINOR)
				.query(Long.class)
				.single();
	}

	private void accrue(long venueId, long bookingId) {
		jdbc.sql("""
				INSERT INTO payout_ledger_entry (venue_id, booking_id, entry_type, gross_minor,
				                                 commission_minor, net_minor, currency)
				VALUES (:venue, :booking, 'ACCRUAL', :gross, :commission, :net, 'EUR')
				""")
				.param("venue", venueId)
				.param("booking", bookingId)
				.param("gross", GROSS_MINOR)
				.param("commission", OLD_COMMISSION)
				.param("net", GROSS_MINOR - OLD_COMMISSION)
				.update();
	}

	private long ledgerCommission(long bookingId) {
		return jdbc.sql("""
				SELECT commission_minor FROM payout_ledger_entry
				 WHERE booking_id = :booking AND entry_type = 'ACCRUAL'
				""")
				.param("booking", bookingId)
				.query(Long.class)
				.single();
	}
}
