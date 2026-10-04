package ai.riviera.platform.customer;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.awaitility.Awaitility;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.customer.api.CustomerDirectory;
import ai.riviera.platform.customer.application.AccountErasureStore;
import ai.riviera.platform.customer.application.ExpireGuestContacts;
import ai.riviera.platform.customer.application.RetentionWindow;
import ai.riviera.platform.customer.spi.GuestBookingHistory;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.customer.vocabulary.GuestContact;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies the automated retention sweep (Slice 2 of #101) against real Postgres via Testcontainers.
 * Proves what the unit spec cannot: the real candidate/scrub SQL, the dependency-inverted
 * {@code customer.spi.GuestBookingHistory} seam resolved through the Spring context (implemented in
 * {@code booking}), the live-account gate, that the scrub reaches the expired guest's reviews through the
 * sibling {@code customer.spi.ReviewErasure} seam (name and comment gone, star kept), and above all that the
 * retained booking / payment / payout financial rows survive a retention scrub unchanged
 * (statutory-retention exception, invariant #9).
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

	@Autowired
	CustomerDirectory customers;

	@Autowired
	AccountErasureStore store;

	@Autowired
	PlatformTransactionManager txManager;

	@Autowired
	RetentionWindow retention;

	@Test
	void reportsOnlyGuestsWithABookingOnOrAfterTheCutoff() {
		CustomerId recent = insertGuestWithBooking("retention-it-recent@example.com", LocalDate.of(2029, 9, 1));
		CustomerId stale = insertGuestWithBooking("retention-it-stale@example.com", LocalDate.of(2020, 9, 1));

		Set<CustomerId> live = history.withBookingOnOrAfter(List.of(recent, stale), LocalDate.of(2026, 1, 1));

		assertThat(live).containsExactly(recent);
	}

	@Test
	void aStayEndingAfterTheCutoffIsARetentionBasis() {
		CustomerId straddling = insertGuestWithBooking("retention-it-straddle@example.com", LocalDate.of(2025, 12, 30));
		jdbc.update("UPDATE booking SET last_date = DATE '2026-01-02' WHERE code = ?",
				bookingCode("retention-it-straddle@example.com"));

		Set<CustomerId> live = history.withBookingOnOrAfter(List.of(straddling), LocalDate.of(2026, 1, 1));

		assertThat(live).as("the span's last day, not its first, decides").containsExactly(straddling);
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
		assertThat(string("SELECT p.status FROM payment p JOIN payment_booking b ON b.payment_id = p.id "
				+ "WHERE b.booking_ref = ?", bookingId)).isEqualTo("SUCCEEDED");
		assertThat(count("SELECT count(*) FROM payout_ledger_entry WHERE booking_id = ? AND net_minor = 3825",
				bookingId)).isEqualTo(1);
	}

	@Test
	void scrubsTheExpiredGuestsReviewsToo() {
		long customerId = insertAgedGuest("retention-it-reviewed@example.com");
		long venueId = seededVenueId();
		long bookingId = insertBooking("RETREVIEWED1", venueId, seededSetId(venueId), customerId,
				LocalDate.of(2015, 8, 2));
		jdbc.update("""
				INSERT INTO review (booking_id, venue_id, stay_date, stars, comment, display_name, created_at)
				VALUES (?, ?, ?, 4, 'Long ago, lovely', 'Old Guest', NOW())
				""", bookingId, venueId, Date.valueOf(LocalDate.of(2015, 8, 2)));

		assertThat(sweep.sweep()).isPositive();

		assertThat(timestamp("SELECT erased_at FROM customer WHERE id = ?", customerId)).isNotNull();
		assertThat(jdbc.queryForObject("SELECT stars FROM review WHERE booking_id = ?", Integer.class, bookingId))
				.as("the star keeps counting").isEqualTo(4);
		assertThat(string("SELECT comment FROM review WHERE booking_id = ?", bookingId)).isNull();
		assertThat(string("SELECT display_name FROM review WHERE booking_id = ?", bookingId)).isNull();
		assertThat(count("SELECT count(*) FROM booking WHERE id = ? AND customer_id = ?", bookingId, customerId))
				.isEqualTo(1);
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
	void aRunWalksPastMoreKeptContactsThanOneBatchToReachAnExpiredOne() {
		long venueId = seededVenueId();
		try {
			jdbc.update("""
					INSERT INTO customer (email, full_name, phone, created_at, updated_at)
					SELECT 'retention-it-kept-' || n || '@example.com', 'Retention Guest', '+355691110900',
					       TIMESTAMPTZ '2015-01-01', TIMESTAMPTZ '2015-01-01'
					FROM generate_series(1, ?) AS n
					""", retention.batchSize() + 1);
			jdbc.update("""
					INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
					                     amount_minor, amount_currency, status)
					SELECT 'RETKEPT' || c.id, ?, ?, c.id, DATE '2099-08-01', 4500, 'EUR', 'CANCELLED'
					FROM customer c WHERE c.email LIKE 'retention-it-kept-%'
					""", venueId, seededSetId(venueId));
			long expired = insertAgedGuest("retention-it-behind-kept@example.com");

			sweep.sweep();

			assertThat(timestamp("SELECT erased_at FROM customer WHERE id = ?", expired))
					.as("more than a batch of kept contacts at lower ids must not stall the run (#1293)")
					.isNotNull();
			assertThat(count("SELECT count(*) FROM customer WHERE email LIKE 'retention-it-kept-%' AND erased_at IS NULL"))
					.isEqualTo(retention.batchSize() + 1);
		}
		finally {
			jdbc.update("DELETE FROM booking WHERE code LIKE 'RETKEPT%'");
			jdbc.update("DELETE FROM customer WHERE email LIKE 'retention-it-kept-%'");
		}
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

	@Test
	void aGuestWhoBooksWhileTheSweepReachesTheirRowIsNotScrubbed() throws Exception {
		// The booking's find-or-create holds the row when the scrub arrives (#1303): after the wait, the row is young.
		String email = "retention-it-racing@example.com";
		long customerId = insertAgedGuest(email);
		TransactionTemplate tx = new TransactionTemplate(txManager);
		CompletableFuture<Integer> bookingPid = new CompletableFuture<>();
		CountDownLatch bookingCommits = new CountDownLatch(1);
		try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
			try {
				Future<?> booking = pool.submit(() -> tx.executeWithoutResult(status -> {
					customers.findOrCreate(new GuestContact(email, "Returning Guest", "+355691110901"));
					bookingPid.complete(jdbc.queryForObject("SELECT pg_backend_pid()", Integer.class));
					try {
						bookingCommits.await(30, TimeUnit.SECONDS);
					}
					catch (InterruptedException interrupted) {
						Thread.currentThread().interrupt();
					}
				}));
				int pid = bookingPid.get(10, TimeUnit.SECONDS);
				Future<Integer> swept = pool.submit(sweep::sweep);
				Awaitility.await().atMost(Duration.ofSeconds(10)).until(() -> sessionsBlockedBy(pid) >= 1L);
				bookingCommits.countDown();
				booking.get(10, TimeUnit.SECONDS);
				swept.get(10, TimeUnit.SECONDS);
			}
			finally {
				bookingCommits.countDown();
			}
		}

		assertThat(timestamp("SELECT erased_at FROM customer WHERE id = ?", customerId))
				.as("the guest was refreshed by a booking before the scrub landed, so the row is no longer expired")
				.isNull();
		assertThat(string("SELECT full_name FROM customer WHERE id = ?", customerId)).isEqualTo("Returning Guest");
	}

	@Test
	void aGuestWhoseEmailIsClaimedAfterTheCandidateReadIsNotScrubbed() {
		String email = "retention-it-late-signup@example.com";
		long customerId = insertAgedGuest(email);
		Instant olderThan = Instant.parse("2020-01-01T00:00:00Z");
		assertThat(store.expiredGuestCandidates(olderThan, new CustomerId(0), Integer.MAX_VALUE)).contains(new CustomerId(customerId));

		insertAccount(email);

		assertThat(store.eraseGuestById(new CustomerId(customerId), olderThan))
				.as("the scrub re-applies the live-account gate the candidate read passed")
				.isFalse();
		assertThat(timestamp("SELECT erased_at FROM customer WHERE id = ?", customerId)).isNull();
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
		Long payment = jdbc.queryForObject("""
				INSERT INTO payment (payment_intent_id, amount_minor, currency, status)
				VALUES (?, ?, 'EUR', 'SUCCEEDED') RETURNING id
				""", Long.class, intentId, amountMinor);
		jdbc.update("INSERT INTO payment_booking (payment_id, booking_ref, amount_minor) VALUES (?, ?, ?)",
				payment, bookingId, amountMinor);
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

	private long sessionsBlockedBy(int pid) {
		return jdbc.queryForObject("SELECT COUNT(*) FROM pg_stat_activity WHERE ? = ANY (pg_blocking_pids(pid))",
				Long.class, pid);
	}
}
