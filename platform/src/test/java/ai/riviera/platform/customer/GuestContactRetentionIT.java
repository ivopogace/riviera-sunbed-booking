package ai.riviera.platform.customer;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.customer.application.ExpireGuestContacts;
import ai.riviera.platform.customer.spi.GuestBookingHistory;
import ai.riviera.platform.customer.vocabulary.CustomerId;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies the automated retention sweep (Slice 2 of #101) against real Postgres via Testcontainers.
 * Proves what the unit spec cannot: the real candidate/scrub SQL, the dependency-inverted
 * {@code customer.spi.GuestBookingHistory} seam resolved through the Spring context (implemented in
 * {@code booking}), the live-account gate, and above all that the retained booking / payment / payout
 * financial rows survive a retention scrub unchanged (statutory-retention exception, invariant #9).
 *
 * <p>Runs against the shipped default window ({@code P10Y}) — the sweep <em>service</em> is always wired;
 * only the scheduler that fires it is disabled by default. A shared container is reused across ITs, so
 * every fixture uses unique emails / codes and resolves the seeded venue + set by query. Guest fixtures are
 * <strong>backdated</strong> ({@link #insertAgedGuest}) because {@code updated_at} defaults to {@code NOW()},
 * which would make a fresh row too young to be a candidate and mask the gate under test.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "booking.no-show.enabled=false")
class GuestContactRetentionIT {

	@Autowired
	GuestBookingHistory history;

	@Autowired
	ExpireGuestContacts sweep;

	@Autowired
	JdbcTemplate jdbc;

	@Test
	void reportsOnlyGuestsWithABookingOnOrAfterTheCutoff() {
		CustomerId recent = insertGuestWithBooking("retention-it-recent@example.com", LocalDate.of(2029, 9, 1));
		CustomerId stale = insertGuestWithBooking("retention-it-stale@example.com", LocalDate.of(2020, 9, 1));

		Set<CustomerId> live = history.withBookingOnOrAfter(List.of(recent, stale), LocalDate.of(2026, 1, 1));

		assertThat(live).containsExactly(recent);
	}

	@Test
	void scrubsExpiredGuestContactAndLeavesBookingPaymentAndPayoutUntouched() {
		long customerId = insertAgedGuest("retention-it-expired@example.com");
		long venueId = seededVenueId();
		long bookingId = insertBooking("RETEXPIRED1", venueId, seededSetId(venueId), customerId,
				LocalDate.of(2015, 8, 1));
		insertPayment(bookingId, "pi_retention_it_expired", 4500);
		insertPayout(venueId, bookingId, 4500, 675); // 15% commission → net 3825

		assertThat(sweep.sweep()).isPositive();

		// contact tombstoned in place (AC-1)
		assertThat(string("SELECT email FROM customer WHERE id = ?", customerId))
				.startsWith("erased+").endsWith("@erased.invalid");
		assertThat(string("SELECT full_name FROM customer WHERE id = ?", customerId)).isEqualTo("ERASED");
		assertThat(string("SELECT phone FROM customer WHERE id = ?", customerId)).isEqualTo("ERASED");
		assertThat(timestamp("SELECT erased_at FROM customer WHERE id = ?", customerId)).isNotNull();

		// retained financial rows unchanged, FK still resolves (AC-3, invariant #9)
		assertThat(string("SELECT status FROM booking WHERE id = ?", bookingId)).isEqualTo("CONFIRMED");
		assertThat(count("SELECT count(*) FROM booking WHERE id = ? AND customer_id = ? AND amount_minor = 4500",
				bookingId, customerId)).isEqualTo(1);
		assertThat(string("SELECT status FROM payment WHERE booking_ref = ?", bookingId)).isEqualTo("SUCCEEDED");
		assertThat(count("SELECT count(*) FROM payout_ledger_entry WHERE booking_id = ? AND net_minor = 3825",
				bookingId)).isEqualTo(1);
	}

	@Test
	void retainsGuestWhoseBookingIsStillInsideTheWindow() {
		String email = "retention-it-inwindow@example.com";
		long customerId = insertAgedGuest(email);
		long venueId = seededVenueId();
		// far-future date, so it stays inside the window whatever "today" the sweep computes
		insertBooking("RETINWINDOW1", venueId, seededSetId(venueId), customerId, LocalDate.of(2099, 8, 1));

		sweep.sweep();

		assertThat(timestamp("SELECT erased_at FROM customer WHERE id = ?", customerId))
				.as("a booking inside the retention window is a live basis — the contact must survive")
				.isNull();
		assertThat(string("SELECT email FROM customer WHERE id = ?", customerId)).isEqualTo(email);
	}

	@Test
	void skipsGuestContactClaimedByALiveAccount() {
		String email = "retention-it-claimed@example.com";
		long customerId = insertAgedGuest(email);
		insertAccount(email);

		sweep.sweep();

		assertThat(timestamp("SELECT erased_at FROM customer WHERE id = ?", customerId))
				.as("a signed-up customer's contact is never a retention candidate")
				.isNull();
		assertThat(string("SELECT full_name FROM customer WHERE id = ?", customerId)).isEqualTo("Retention Guest");
	}

	@Test
	void doesNotRescrubTombstonedRows() {
		long customerId = insertAgedGuest("retention-it-idem@example.com");

		assertThat(sweep.sweep()).isPositive();
		Timestamp firstErasedAt = timestamp("SELECT erased_at FROM customer WHERE id = ?", customerId);

		sweep.sweep();

		assertThat(timestamp("SELECT erased_at FROM customer WHERE id = ?", customerId))
				.as("a tombstoned row is not a candidate, so a second sweep must not re-stamp erased_at")
				.isEqualTo(firstErasedAt);
	}

	// --- fixture helpers -------------------------------------------------------------------------------

	private CustomerId insertGuestWithBooking(String email, LocalDate bookingDate) {
		long customerId = insertAgedGuest(email);
		long venueId = seededVenueId();
		insertBooking(bookingCode(email), venueId, seededSetId(venueId), customerId, bookingDate);
		return new CustomerId(customerId);
	}

	/**
	 * A guest row backdated past any plausible retention window, so the row-age gate never masks the gate a
	 * given test is actually about.
	 */
	private long insertAgedGuest(String email) {
		return jdbc.queryForObject("""
				INSERT INTO customer (email, full_name, phone, created_at, updated_at)
				VALUES (?, 'Retention Guest', '+355691110900', TIMESTAMPTZ '2015-01-01', TIMESTAMPTZ '2015-01-01')
				RETURNING id
				""", Long.class, email);
	}

	private void insertAccount(String email) {
		jdbc.update("INSERT INTO customer_account (email, password_hash) VALUES (?, '{bcrypt}$2a$claimed')", email);
	}

	private long insertBooking(String code, long venueId, long setId, long customerId, LocalDate bookingDate) {
		return jdbc.queryForObject("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status)
				VALUES (?, ?, ?, ?, ?, 4500, 'EUR', 'CONFIRMED') RETURNING id
				""", Long.class, code, venueId, setId, customerId, Date.valueOf(bookingDate));
	}

	private void insertPayment(long bookingId, String intentId, long amountMinor) {
		jdbc.update("""
				INSERT INTO payment (booking_ref, payment_intent_id, amount_minor, currency, status)
				VALUES (?, ?, ?, 'EUR', 'SUCCEEDED')
				""", bookingId, intentId, amountMinor);
	}

	private void insertPayout(long venueId, long bookingId, long gross, long commission) {
		jdbc.update("""
				INSERT INTO payout_ledger_entry (venue_id, booking_id, entry_type, gross_minor,
				                                 commission_minor, net_minor, currency)
				VALUES (?, ?, 'ACCRUAL', ?, ?, ?, 'EUR')
				""", venueId, bookingId, gross, commission, gross - commission);
	}

	/** Codes are bearer credentials (invariant #7); fixtures only need uniqueness, derived from the email. */
	private static String bookingCode(String email) {
		return "RET" + Integer.toHexString(email.hashCode()).toUpperCase(Locale.ROOT);
	}

	private long seededVenueId() {
		return jdbc.queryForObject("SELECT id FROM venue WHERE name = 'Miramar Beach Club'", Long.class);
	}

	private long seededSetId(long venueId) {
		return jdbc.queryForObject(
				"SELECT id FROM set_position WHERE venue_id = ? ORDER BY id LIMIT 1", Long.class, venueId);
	}

	private String string(String sql, Object arg) {
		return jdbc.queryForObject(sql, String.class, arg);
	}

	private Timestamp timestamp(String sql, Object arg) {
		return jdbc.queryForObject(sql, Timestamp.class, arg);
	}

	private int count(String sql, Object... args) {
		Integer n = jdbc.queryForObject(sql, Integer.class, args);
		return n == null ? 0 : n;
	}
}
