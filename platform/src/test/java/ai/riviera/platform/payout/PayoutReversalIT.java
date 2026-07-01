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
import ai.riviera.platform.booking.api.BookingCancelled;
import ai.riviera.platform.booking.api.BookingId;
import ai.riviera.platform.payout.application.PayoutLedger;
import ai.riviera.platform.payout.domain.PayoutLedgerEntry;
import ai.riviera.platform.venue.api.SetId;
import ai.riviera.platform.venue.api.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * AC-6 (issue #11): a {@link BookingCancelled} posts exactly one proportional {@code REVERSAL} that
 * mirrors the booking's {@code ACCRUAL} (ADR-0005) — full for a full refund, partial for a partial
 * refund, none when nothing is refunded — and is idempotent under registry redelivery. End-to-end
 * through the async {@code @ApplicationModuleListener} + Event Publication Registry; Testcontainers.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class PayoutReversalIT {

	private static final Duration WAIT = Duration.ofSeconds(15);

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

	/** Insert a CONFIRMED booking (the FK target) and accrue its ACCRUAL (gross 4500, 15% → net 3825). */
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
				.param("cust", customer).param("date", LocalDate.of(2030, 7, 1))
				.query(Long.class).single();
		ledger.accrue(PayoutLedgerEntry.accrual(new VenueId(set[1]), booking, 4500L, 1500, "EUR"));
		return new Ref(booking, set[1], set[0]);
	}

	private BookingCancelled cancelled(Ref b, long refundMinor) {
		return cancelled(b, refundMinor, ai.riviera.platform.booking.api.RefundReason.POLICY);
	}

	private BookingCancelled cancelled(Ref b, long refundMinor,
			ai.riviera.platform.booking.api.RefundReason reason) {
		return new BookingCancelled(new BookingId(b.bookingId()), new VenueId(b.venueId()),
				new SetId(b.setId()), LocalDate.of(2030, 7, 1), refundMinor, "EUR", reason);
	}

	private void publishInTransaction(BookingCancelled event) {
		new TransactionTemplate(txManager).executeWithoutResult(s -> publisher.publishEvent(event));
	}

	private long reversalRows(long bookingId) {
		return jdbc.sql("SELECT COUNT(*) FROM payout_ledger_entry "
						+ "WHERE booking_id = :id AND entry_type = 'REVERSAL'")
				.param("id", bookingId).query(Long.class).single();
	}

	private long reversalNet(long bookingId) {
		return jdbc.sql("SELECT net_minor FROM payout_ledger_entry "
						+ "WHERE booking_id = :id AND entry_type = 'REVERSAL'")
				.param("id", bookingId).query(Long.class).single();
	}

	private String reversalReason(long bookingId) {
		return jdbc.sql("SELECT reason FROM payout_ledger_entry "
						+ "WHERE booking_id = :id AND entry_type = 'REVERSAL'")
				.param("id", bookingId).query(String.class).single();
	}

	@Test
	void partialRefundReversesProportionally() {
		Ref b = bookingWithAccrual("REV00001");

		publishInTransaction(cancelled(b, 2250L)); // 50% refund

		Awaitility.await().atMost(WAIT).untilAsserted(() -> assertEquals(1L, reversalRows(b.bookingId())));
		assertEquals(1913L, reversalNet(b.bookingId()), "net = 2250 - floorDiv(675×2250,4500)=337");
	}

	@Test
	void fullRefundReversesTheWholeAccrual() {
		Ref b = bookingWithAccrual("REV00002");

		publishInTransaction(cancelled(b, 4500L));

		Awaitility.await().atMost(WAIT).untilAsserted(() -> assertEquals(1L, reversalRows(b.bookingId())));
		assertEquals(3825L, reversalNet(b.bookingId()), "full reversal nets out the accrual (3825)");
		assertEquals("POLICY", reversalReason(b.bookingId()), "the reversal records the refund reason (U9)");
	}

	@Test
	void weatherReversalCarriesWeatherReason() {
		// AC-5 (U9, issue #12): an admin weather refund cancels with reason WEATHER → the proportional
		// REVERSAL (here full) records reason WEATHER so the ledger distinguishes it from a policy refund.
		Ref b = bookingWithAccrual("REVWX001");

		publishInTransaction(cancelled(b, 4500L, ai.riviera.platform.booking.api.RefundReason.WEATHER));

		Awaitility.await().atMost(WAIT).untilAsserted(() -> assertEquals(1L, reversalRows(b.bookingId())));
		assertEquals(3825L, reversalNet(b.bookingId()), "full weather reversal nets out the accrual");
		assertEquals("WEATHER", reversalReason(b.bookingId()), "the reversal records reason WEATHER");
	}

	@Test
	void redeliveryIsIdempotent() {
		Ref b = bookingWithAccrual("REV00003");
		BookingCancelled event = cancelled(b, 4500L);

		publishInTransaction(event);
		publishInTransaction(event); // registry at-least-once redelivery

		Awaitility.await().atMost(WAIT).untilAsserted(() -> assertEquals(1L, reversalRows(b.bookingId())));
		Awaitility.await().during(Duration.ofSeconds(2)).atMost(WAIT)
				.until(() -> reversalRows(b.bookingId()) == 1L);
	}

	@Test
	void noRefundPostsNoReversal() {
		Ref b = bookingWithAccrual("REV00004");

		publishInTransaction(cancelled(b, 0L)); // non-refundable cancel

		// Give the async listener time to run, then assert it deliberately posted nothing (ADR-0005).
		Awaitility.await().during(Duration.ofSeconds(3)).atMost(WAIT)
				.until(() -> reversalRows(b.bookingId()) == 0L);
	}
}
