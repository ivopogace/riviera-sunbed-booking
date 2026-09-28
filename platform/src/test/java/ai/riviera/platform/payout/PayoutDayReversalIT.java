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
import ai.riviera.platform.booking.events.BookingDayRefunded;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.payout.application.PayoutLedger;
import ai.riviera.platform.payout.domain.PayoutLedgerEntry;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * AC-6 of issue #1210: a {@link BookingDayRefunded} posts exactly one {@code DAY_REVERSAL} per
 * {@code (booking, day)} however often it is redelivered, two storm dates post two, a later
 * {@link BookingCancelled} reverses only the remainder, and a booking reversed in parts nets exactly
 * zero (invariant #9). End-to-end through the async listeners + Event Publication Registry; Testcontainers.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class PayoutDayReversalIT {

	private static final Duration WAIT = Duration.ofSeconds(15);
	private static final LocalDate FIRST_DAY = LocalDate.of(2030, 7, 1);
	private static final LocalDate DAY_8 = FIRST_DAY.plusDays(7);
	private static final LocalDate DAY_9 = FIRST_DAY.plusDays(8);

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

	/** A 14-day CONFIRMED booking at 3000/day with its ACCRUAL (gross 42000, 15% → commission 6300, net 35700). */
	private Ref stayWithAccrual(String code) {
		long[] set = jdbc.sql("SELECT id, venue_id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1")
				.query((rs, n) -> new long[] {rs.getLong("id"), rs.getLong("venue_id")}).single();
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		long booking = jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, last_date,
				                     amount_minor, amount_currency, status)
				VALUES (:code, :venue, :set, :cust, :first, :last, 42000, 'EUR', 'CONFIRMED')
				RETURNING id
				""")
				.param("code", code).param("venue", set[1]).param("set", set[0])
				.param("cust", customer).param("first", FIRST_DAY).param("last", FIRST_DAY.plusDays(13))
				.query(Long.class).single();
		ledger.accrue(PayoutLedgerEntry.accrual(new VenueId(set[1]), booking, 42000L, 1500, "EUR"));
		return new Ref(booking, set[1], set[0]);
	}

	private BookingDayRefunded dayRefunded(Ref b, LocalDate day) {
		return new BookingDayRefunded(new BookingId(b.bookingId()), new VenueId(b.venueId()),
				new SetId(b.setId()), day, 3000L, "EUR", null);
	}

	private void publishInTransaction(Object event) {
		new TransactionTemplate(txManager).executeWithoutResult(s -> publisher.publishEvent(event));
	}

	private long rows(long bookingId, String type) {
		return jdbc.sql("SELECT COUNT(*) FROM payout_ledger_entry WHERE booking_id = :id AND entry_type = :type")
				.param("id", bookingId).param("type", type).query(Long.class).single();
	}

	private long net(long bookingId) {
		return jdbc.sql("""
				SELECT SUM(CASE WHEN entry_type = 'ACCRUAL' THEN net_minor ELSE -net_minor END)
				FROM payout_ledger_entry WHERE booking_id = :id
				""").param("id", bookingId).query(Long.class).single();
	}

	@Test
	void oneDayReversalPerBookingAndDay() {
		Ref b = stayWithAccrual("DAYREV001");
		BookingDayRefunded event = dayRefunded(b, DAY_8);

		publishInTransaction(event);
		publishInTransaction(event); // registry at-least-once redelivery

		Awaitility.await().atMost(WAIT).untilAsserted(() -> assertEquals(1L, rows(b.bookingId(), "DAY_REVERSAL")));
		Awaitility.await().during(Duration.ofSeconds(2)).atMost(WAIT)
				.until(() -> rows(b.bookingId(), "DAY_REVERSAL") == 1L);
		assertEquals(35700L - 2550L, net(b.bookingId()), "day 8's 3000 less its 450 commission is reversed");
		assertEquals("WEATHER", jdbc.sql("SELECT reason FROM payout_ledger_entry "
						+ "WHERE booking_id = :id AND entry_type = 'DAY_REVERSAL'")
				.param("id", b.bookingId()).query(String.class).single());
	}

	@Test
	void twoStormDatesReverseTwoDays() {
		Ref b = stayWithAccrual("DAYREV002");

		publishInTransaction(dayRefunded(b, DAY_8));
		publishInTransaction(dayRefunded(b, DAY_9));

		Awaitility.await().atMost(WAIT).untilAsserted(() -> assertEquals(2L, rows(b.bookingId(), "DAY_REVERSAL")));
		assertEquals(35700L - 2 * 2550L, net(b.bookingId()));
	}

	@Test
	void aLaterCancellationReversesOnlyTheRemainderAndTheBookingNetsZero() {
		Ref b = stayWithAccrual("DAYREV003");
		publishInTransaction(dayRefunded(b, DAY_8));
		Awaitility.await().atMost(WAIT).untilAsserted(() -> assertEquals(1L, rows(b.bookingId(), "DAY_REVERSAL")));

		publishInTransaction(new BookingCancelled(new BookingId(b.bookingId()), new VenueId(b.venueId()),
				new SetId(b.setId()), FIRST_DAY, 39000L, "EUR", RefundReason.POLICY, FIRST_DAY.plusDays(13)));

		Awaitility.await().atMost(WAIT).untilAsserted(() -> assertEquals(1L, rows(b.bookingId(), "REVERSAL")));
		assertEquals(39000L, jdbc.sql("SELECT gross_minor FROM payout_ledger_entry "
						+ "WHERE booking_id = :id AND entry_type = 'REVERSAL'")
				.param("id", b.bookingId()).query(Long.class).single(), "the remainder, never the day again");
		assertEquals(0L, net(b.bookingId()), "reversed in parts, the booking nets exactly zero (invariant #9)");
	}
}
