package ai.riviera.platform.payout;

import java.time.Duration;
import java.time.LocalDate;

import org.awaitility.Awaitility;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.events.BookingCancelled;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.payout.application.PayoutLedger;
import ai.riviera.platform.payout.domain.PayoutLedgerEntry;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * The venue-change fee: a refund a venue's own remodel caused posts a
 * {@code FEE} beside the {@code REVERSAL}, from the same listener and the same transaction. Keyed on
 * {@link RefundReason#VENUE_CHANGE} alone, so it covers both shapes that reason carries — the
 * remodel refunding a booking it could not move, and a moved guest taking the free exit that move
 * earned them (ADR-0021). A {@code POLICY} or {@code WEATHER} refund pays none, and a remodel
 * <em>release</em> of an unpaid booking — which reaches this listener as {@code VENUE_CHANGE} with a
 * zero refund — pays none either, because nothing was collected and nothing is reversed.
 * End-to-end through the async {@code @ApplicationModuleListener} + Event Publication Registry;
 * Testcontainers.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class PayoutVenueChangeFeeIT {

	private static final Duration WAIT = Duration.ofSeconds(15);

	/** The {@code riviera.payout.venue-change-fee-minor} default, in EUR minor units. */
	private static final long FEE_MINOR = 500L;

	private static final LocalDate SERVICE_DAY = LocalDate.of(2030, 8, 1);

	@Autowired
	JdbcClient jdbc;

	@Autowired
	PayoutLedger ledger;

	@Autowired
	ApplicationEventPublisher publisher;

	@Autowired
	PlatformTransactionManager txManager;

	private record Ref(long bookingId, long venueId, long setId) {
	}

	/** A CONFIRMED booking (the FK target) with its ACCRUAL posted: gross 4500, 15% → net 3825. */
	private Ref bookingWithAccrual(String code) {
		long[] set = jdbc.sql("SELECT id, venue_id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1")
				.query((rs, n) -> new long[] {rs.getLong("id"), rs.getLong("venue_id")}).single();
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		long booking = jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status)
				VALUES (:code, :venue, :set, :cust, :date, 4500, 'EUR', 'CONFIRMED')
				RETURNING id
				""")
				.param("code", code).param("venue", set[1]).param("set", set[0])
				.param("cust", customer).param("date", SERVICE_DAY)
				.query(Long.class).single();
		ledger.accrue(PayoutLedgerEntry.accrual(new VenueId(set[1]), booking, 4500L, 1500, "EUR"));
		return new Ref(booking, set[1], set[0]);
	}

	private BookingCancelled cancelled(Ref b, long refundMinor, RefundReason reason) {
		return new BookingCancelled(new BookingId(b.bookingId()), new VenueId(b.venueId()),
				new SetId(b.setId()), SERVICE_DAY, refundMinor, "EUR", reason);
	}

	private void publishInTransaction(BookingCancelled event) {
		new TransactionTemplate(txManager).executeWithoutResult(s -> publisher.publishEvent(event));
	}

	private long rowsOfType(long bookingId, String entryType) {
		return jdbc.sql("SELECT COUNT(*) FROM payout_ledger_entry "
						+ "WHERE booking_id = :id AND entry_type = :type")
				.param("id", bookingId).param("type", entryType).query(Long.class).single();
	}

	private long feeRows(long bookingId) {
		return rowsOfType(bookingId, "FEE");
	}

	@Test
	void venueChangeRefundPostsAReversalAndOneFee() {
		Ref b = bookingWithAccrual("FEE00001");

		publishInTransaction(cancelled(b, 4500L, RefundReason.VENUE_CHANGE));

		Awaitility.await().atMost(WAIT).untilAsserted(() -> assertEquals(1L, feeRows(b.bookingId())));
		assertEquals(1L, rowsOfType(b.bookingId(), "REVERSAL"), "the fee rides with the reversal");

		var fee = jdbc.sql("""
				SELECT gross_minor, commission_minor, net_minor, currency, reason
				FROM payout_ledger_entry WHERE booking_id = :id AND entry_type = 'FEE'
				""")
				.param("id", b.bookingId())
				.query((rs, n) -> new long[] {rs.getLong("gross_minor"), rs.getLong("commission_minor"),
						rs.getLong("net_minor")})
				.single();
		assertEquals(0L, fee[0], "a fee is charged against no booking amount");
		assertEquals(0L, fee[1], "the platform takes no commission on its own fee");
		assertEquals(FEE_MINOR, fee[2], "the configured fee, in integer minor units (invariant #5)");

		assertEquals("EUR", jdbc.sql("SELECT currency FROM payout_ledger_entry "
						+ "WHERE booking_id = :id AND entry_type = 'FEE'")
				.param("id", b.bookingId()).query(String.class).single(),
				"the fee is charged in the currency the booking was collected in");
		assertEquals("VENUE_CHANGE", jdbc.sql("SELECT reason FROM payout_ledger_entry "
						+ "WHERE booking_id = :id AND entry_type = 'FEE'")
				.param("id", b.bookingId()).query(String.class).single(),
				"the fee names the reason that earned it, so the ledger stays auditable");
	}

	@Test
	void redeliveryPostsNoSecondFee() {
		Ref b = bookingWithAccrual("FEE00002");
		BookingCancelled event = cancelled(b, 4500L, RefundReason.VENUE_CHANGE);

		publishInTransaction(event);
		publishInTransaction(event); // registry at-least-once redelivery

		Awaitility.await().atMost(WAIT).untilAsserted(() -> assertEquals(1L, feeRows(b.bookingId())));
		Awaitility.await().during(Duration.ofSeconds(2)).atMost(WAIT)
				.until(() -> feeRows(b.bookingId()) == 1L);
	}

	@Test
	void policyAndWeatherRefundsPostNoFee() {
		Ref policy = bookingWithAccrual("FEE00003");
		Ref weather = bookingWithAccrual("FEE00004");

		publishInTransaction(cancelled(policy, 4500L, RefundReason.POLICY));
		publishInTransaction(cancelled(weather, 4500L, RefundReason.WEATHER));

		Awaitility.await().atMost(WAIT)
				.untilAsserted(() -> assertEquals(1L, rowsOfType(policy.bookingId(), "REVERSAL")));
		Awaitility.await().atMost(WAIT)
				.untilAsserted(() -> assertEquals(1L, rowsOfType(weather.bookingId(), "REVERSAL")));
		assertEquals(0L, feeRows(policy.bookingId()), "a policy refund is the guest's own, not the venue's");
		assertEquals(0L, feeRows(weather.bookingId()), "force majeure is not a venue-caused change");
	}

	@Test
	void aReleaseThatReturnsNothingPostsNoFee() {
		// A remodel release publishes VENUE_CHANGE with refundMinor = 0 — nothing was collected.
		Ref b = bookingWithAccrual("FEE00005");

		publishInTransaction(cancelled(b, 0L, RefundReason.VENUE_CHANGE));

		Awaitility.await().during(Duration.ofSeconds(3)).atMost(WAIT)
				.until(() -> feeRows(b.bookingId()) == 0L && rowsOfType(b.bookingId(), "REVERSAL") == 0L);
	}
}
