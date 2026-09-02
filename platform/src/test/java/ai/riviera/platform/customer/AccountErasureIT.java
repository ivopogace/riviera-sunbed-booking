package ai.riviera.platform.customer;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.customer.api.AccountErasure;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.EraseOutcome;
import ai.riviera.platform.review.api.VenueRatingSummary;
import ai.riviera.platform.review.vocabulary.RatingSummary;
import ai.riviera.platform.review.vocabulary.VenueRef;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies the right-to-erasure scrub (Slice 1 of #101) against real Postgres via Testcontainers —
 * which boots the full Flyway chain, so this exercises migration <strong>V30</strong>. Proves what the
 * unit spec cannot: the real tombstone SQL, the SSO/token child deletes, tombstone-email uniqueness, and
 * above all that the retained booking / payment / payout financial rows survive the scrub unchanged — the
 * {@code booking} FKs are {@code ON DELETE RESTRICT} and the payout ledger holds no PII, so erasure never
 * touches them (statutory-retention exception, invariant #9) — and, since reviews carry PII, that the scrub
 * reaches every review of the subject's bookings through the {@code customer.spi.ReviewErasure} seam
 * (implemented in {@code booking}, landing in {@code review}) in the same transaction, tombstoning the name
 * and comment while the star keeps counting. A shared container is reused across ITs, so every fixture uses
 * unique emails / codes / ids and resolves the seeded venue + set by query.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "booking.no-show.enabled=false")
class AccountErasureIT {

	@Autowired
	AccountErasure erasure;

	@Autowired
	VenueRatingSummary ratings;

	@Autowired
	JdbcTemplate jdbc;

	@Test
	void eraseAccountTombstonesPiiDeletesChildrenAndRetainsFinancialRows() {
		String email = "erase-it-keep@example.com";
		long customerId = insertGuest(email, "Kept Name", "+355691110001");
		long accountId = insertAccount(email, "{bcrypt}$2a$kept");
		insertSso(accountId, "erase-it-sub-keep", email);
		insertToken(accountId, "erase-it-token-keep");
		long venueId = seededVenueId();
		long setId = seededSetId(venueId);
		long bookingId = insertBooking("ERASEITKEEP1", venueId, setId, customerId, accountId, "CONFIRMED", 4500);
		insertPayment(bookingId, "pi_erase_it_keep_1", 4500, "SUCCEEDED");
		insertPayout(venueId, bookingId, 4500, 675); // 15% commission → net 3825

		EraseOutcome outcome = erasure.eraseAccount(new CustomerAccountId(accountId));

		assertThat(outcome).isEqualTo(EraseOutcome.ERASED);

		// account row tombstoned in place (email is a unique non-PII placeholder, hash gone, marker set)
		assertThat(string("SELECT email FROM customer_account WHERE id = ?", accountId))
				.startsWith("erased+").endsWith("@erased.invalid");
		assertThat(string("SELECT password_hash FROM customer_account WHERE id = ?", accountId)).isNull();
		assertThat(timestamp("SELECT erased_at FROM customer_account WHERE id = ?", accountId)).isNotNull();

		// guest contact row (same email) tombstoned
		assertThat(string("SELECT email FROM customer WHERE id = ?", customerId)).startsWith("erased+");
		assertThat(string("SELECT full_name FROM customer WHERE id = ?", customerId)).isEqualTo("ERASED");
		assertThat(string("SELECT phone FROM customer WHERE id = ?", customerId)).isEqualTo("ERASED");
		assertThat(timestamp("SELECT erased_at FROM customer WHERE id = ?", customerId)).isNotNull();

		// transient child rows deleted
		assertThat(count("SELECT count(*) FROM customer_sso_identity WHERE account_id = ?", accountId)).isZero();
		assertThat(count("SELECT count(*) FROM customer_account_token WHERE account_id = ?", accountId)).isZero();

		// retained financial rows unchanged (invariant #9) — the FKs still resolve, nothing cascaded
		assertThat(string("SELECT status FROM booking WHERE id = ?", bookingId)).isEqualTo("CONFIRMED");
		assertThat(count("SELECT count(*) FROM booking WHERE id = ? AND account_id = ? AND customer_id = ?",
				bookingId, accountId, customerId)).isEqualTo(1);
		assertThat(string("SELECT status FROM payment WHERE booking_ref = ?", bookingId)).isEqualTo("SUCCEEDED");
		assertThat(count("SELECT count(*) FROM payout_ledger_entry WHERE booking_id = ? AND net_minor = 3825",
				bookingId)).isEqualTo(1);
	}

	@Test
	void eraseAccountIsIdempotent() {
		long accountId = insertAccount("erase-it-idem@example.com", "{bcrypt}$2a$x");

		assertThat(erasure.eraseAccount(new CustomerAccountId(accountId))).isEqualTo(EraseOutcome.ERASED);
		Timestamp firstErasedAt = timestamp("SELECT erased_at FROM customer_account WHERE id = ?", accountId);

		assertThat(erasure.eraseAccount(new CustomerAccountId(accountId))).isEqualTo(EraseOutcome.ALREADY_ERASED);
		assertThat(timestamp("SELECT erased_at FROM customer_account WHERE id = ?", accountId))
				.as("a re-erasure must not re-stamp erased_at").isEqualTo(firstErasedAt);
	}

	@Test
	void eraseAccountTombstonesTheSubjectsReviews() {
		String email = "erase-it-reviews@example.com";
		long customerId = insertGuest(email, "Reviewer", "+355691110010");
		long accountId = insertAccount(email, "{bcrypt}$2a$reviewer");
		long friendId = insertGuest("erase-it-reviews-friend@example.com", "Friend Name", "+355691110011");
		long venueId = seededVenueId();
		long setId = seededSetId(venueId);
		// reachable only through the account: the contact on it is someone else's
		long accountBooking = insertBooking("ERASEITRVW01", venueId, setId, friendId, accountId, "COMPLETED", 4500);
		// reachable only through the guest contact: a signed-out booking, no account
		long guestBooking = insertGuestBooking("ERASEITRVW02", venueId, setId, customerId);
		insertReview(accountBooking, venueId, 5, "Wonderful", "Reviewer R.");
		insertReview(guestBooking, venueId, 3, "Fine", "R.");
		RatingSummary before = ratings.summaryFor(new VenueRef(venueId));

		assertThat(erasure.eraseAccount(new CustomerAccountId(accountId))).isEqualTo(EraseOutcome.ERASED);

		assertThat(reviewRow(accountBooking)).containsExactly(5, null, null);
		assertThat(reviewRow(guestBooking)).containsExactly(3, null, null);
		assertThat(ratings.summaryFor(new VenueRef(venueId))).as("the stars keep counting").isEqualTo(before);
		assertThat(string("SELECT full_name FROM customer WHERE id = ?", friendId))
				.as("the other contact on the account booking is not the subject").isEqualTo("Friend Name");
		assertThat(string("SELECT status FROM booking WHERE id = ?", accountBooking)).isEqualTo("COMPLETED");

		assertThat(erasure.eraseAccount(new CustomerAccountId(accountId))).isEqualTo(EraseOutcome.ALREADY_ERASED);
		assertThat(reviewRow(accountBooking)).containsExactly(5, null, null);
	}

	@Test
	void adminEraseByEmailTombstonesTheGuestsReviews() {
		String email = "erase-it-guest-review@example.com";
		long customerId = insertGuest(email, "Guest Reviewer", "+355691110012");
		long venueId = seededVenueId();
		long bookingId = insertGuestBooking("ERASEITRVW03", venueId, seededSetId(venueId), customerId);
		insertReview(bookingId, venueId, 4, "Nice spot", "G.");

		assertThat(erasure.eraseByEmail(email)).isEqualTo(EraseOutcome.ERASED);

		assertThat(reviewRow(bookingId)).containsExactly(4, null, null);
		assertThat(string("SELECT full_name FROM customer WHERE id = ?", customerId)).isEqualTo("ERASED");
	}

	@Test
	void adminEraseByEmailTombstonesAGuestWithNoAccount() {
		String email = "erase-it-guest@example.com";
		long customerId = insertGuest(email, "Guest Name", "+355691110002");

		assertThat(erasure.eraseByEmail("  ERASE-IT-Guest@Example.com ")) // normalized to the stored key
				.isEqualTo(EraseOutcome.ERASED);
		assertThat(string("SELECT full_name FROM customer WHERE id = ?", customerId)).isEqualTo("ERASED");
	}

	@Test
	void eraseByEmailWithNothingToEraseReturnsNotFound() {
		assertThat(erasure.eraseByEmail("erase-it-absent@example.com")).isEqualTo(EraseOutcome.NOT_FOUND);
	}

	@Test
	void erasingTwoAccountsProducesDistinctTombstonesWithNoUniqueViolation() {
		long a1 = insertAccount("erase-it-uniq-1@example.com", "{bcrypt}$2a$a");
		long a2 = insertAccount("erase-it-uniq-2@example.com", "{bcrypt}$2a$b");

		assertThat(erasure.eraseAccount(new CustomerAccountId(a1))).isEqualTo(EraseOutcome.ERASED);
		assertThat(erasure.eraseAccount(new CustomerAccountId(a2))).isEqualTo(EraseOutcome.ERASED);

		assertThat(string("SELECT email FROM customer_account WHERE id = ?", a1))
				.isNotEqualTo(string("SELECT email FROM customer_account WHERE id = ?", a2));
	}

	// --- fixture helpers -------------------------------------------------------------------------------

	private long insertGuest(String email, String name, String phone) {
		return jdbc.queryForObject("""
				INSERT INTO customer (email, full_name, phone) VALUES (?, ?, ?) RETURNING id
				""", Long.class, email, name, phone);
	}

	private long insertAccount(String email, String hash) {
		return jdbc.queryForObject("""
				INSERT INTO customer_account (email, password_hash) VALUES (?, ?) RETURNING id
				""", Long.class, email, hash);
	}

	private void insertSso(long accountId, String subject, String email) {
		jdbc.update("""
				INSERT INTO customer_sso_identity (account_id, provider, subject, email) VALUES (?, 'GOOGLE', ?, ?)
				""", accountId, subject, email);
	}

	private void insertToken(long accountId, String tokenHash) {
		jdbc.update("""
				INSERT INTO customer_account_token (account_id, purpose, token_hash, expires_at)
				VALUES (?, 'VERIFY_EMAIL', ?, ?)
				""", accountId, tokenHash, Timestamp.from(Instant.parse("2099-01-01T00:00:00Z")));
	}

	private long insertBooking(String code, long venueId, long setId, long customerId, long accountId,
			String status, long amountMinor) {
		return jdbc.queryForObject("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, account_id, booking_date,
				                     amount_minor, amount_currency, status)
				VALUES (?, ?, ?, ?, ?, ?, ?, 'EUR', ?) RETURNING id
				""", Long.class, code, venueId, setId, customerId, accountId,
				Date.valueOf(LocalDate.of(2026, 7, 1)), amountMinor, status);
	}

	private long insertGuestBooking(String code, long venueId, long setId, long customerId) {
		return jdbc.queryForObject("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, amount_minor,
				                     amount_currency, status)
				VALUES (?, ?, ?, ?, ?, 4500, 'EUR', 'COMPLETED') RETURNING id
				""", Long.class, code, venueId, setId, customerId, Date.valueOf(LocalDate.of(2026, 7, 1)));
	}

	private void insertReview(long bookingId, long venueId, int stars, String comment, String displayName) {
		jdbc.update("""
				INSERT INTO review (booking_id, venue_id, stay_date, stars, comment, display_name, created_at)
				VALUES (?, ?, ?, ?, ?, ?, NOW())
				""", bookingId, venueId, Date.valueOf(LocalDate.of(2026, 7, 1)), stars, comment, displayName);
	}

	/** {@code stars, comment, display_name} of the review on {@code bookingId}. */
	private List<Object> reviewRow(long bookingId) {
		return jdbc.queryForObject("SELECT stars, comment, display_name FROM review WHERE booking_id = ?",
				(rs, n) -> Arrays.asList(rs.getInt(1), rs.getString(2), rs.getString(3)), bookingId);
	}

	private void insertPayment(long bookingId, String intentId, long amountMinor, String status) {
		jdbc.update("""
				INSERT INTO payment (booking_ref, payment_intent_id, amount_minor, currency, status)
				VALUES (?, ?, ?, 'EUR', ?)
				""", bookingId, intentId, amountMinor, status);
	}

	private void insertPayout(long venueId, long bookingId, long gross, long commission) {
		jdbc.update("""
				INSERT INTO payout_ledger_entry (venue_id, booking_id, entry_type, gross_minor,
				                                 commission_minor, net_minor, currency)
				VALUES (?, ?, 'ACCRUAL', ?, ?, ?, 'EUR')
				""", venueId, bookingId, gross, commission, gross - commission);
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
