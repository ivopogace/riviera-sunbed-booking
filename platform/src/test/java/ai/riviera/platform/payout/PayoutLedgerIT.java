package ai.riviera.platform.payout;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.payout.application.PayoutLedger;
import ai.riviera.platform.payout.domain.PayoutLedgerEntry;
import ai.riviera.platform.venue.api.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * The ledger adapter's persistence + idempotency contract (issue #9, AC-3) against real Postgres:
 * an accrual writes one auditable row; a re-accrual for the same {@code (booking_id, ACCRUAL)} is a
 * no-op (the {@code ON CONFLICT DO NOTHING} on the {@code UNIQUE} guard — invariant #9), tested
 * directly without async timing. Testcontainers; skipped where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class PayoutLedgerIT {

	@Autowired
	PayoutLedger ledger;

	@Autowired
	JdbcClient jdbc;

	private record BookingRef(long bookingId, long venueId) {
	}

	/** Insert a real booking (FKs require it) on a seeded online set, returning its ids. */
	private BookingRef insertBooking(String code) {
		var set = jdbc.sql("SELECT id, venue_id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1")
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
				.param("cust", customer).param("date", LocalDate.of(2029, 6, 1))
				.query(Long.class).single();
		return new BookingRef(booking, set[1]);
	}

	private long accrualRows(long bookingId) {
		return jdbc.sql("SELECT COUNT(*) FROM payout_ledger_entry "
						+ "WHERE booking_id = :id AND entry_type = 'ACCRUAL'")
				.param("id", bookingId).query(Long.class).single();
	}

	@Test
	void accruesOneAuditableRow() {
		BookingRef b = insertBooking("PAYLEDGER01");
		VenueId venue = new VenueId(b.venueId());

		ledger.accrue(PayoutLedgerEntry.accrual(venue, b.bookingId(), 4500L, 1500, "EUR"));

		assertEquals(1L, accrualRows(b.bookingId()));
		var row = jdbc.sql("""
				SELECT gross_minor, commission_minor, net_minor, currency
				FROM payout_ledger_entry WHERE booking_id = :id AND entry_type = 'ACCRUAL'
				""")
				.param("id", b.bookingId())
				.query((rs, n) -> new long[] {rs.getLong("gross_minor"), rs.getLong("commission_minor"),
						rs.getLong("net_minor")}).single();
		assertEquals(4500L, row[0], "gross");
		assertEquals(675L, row[1], "commission = 15% of 4500");
		assertEquals(3825L, row[2], "net = gross - commission");
	}

	@Test
	void reAccrualForSameBookingIsNoOp() {
		BookingRef b = insertBooking("PAYLEDGER02");
		VenueId venue = new VenueId(b.venueId());
		PayoutLedgerEntry entry = PayoutLedgerEntry.accrual(venue, b.bookingId(), 4500L, 1500, "EUR");

		ledger.accrue(entry);
		ledger.accrue(entry); // redelivery / crash recovery

		assertEquals(1L, accrualRows(b.bookingId()), "exactly one ACCRUAL despite two accrue calls (#9)");
	}
}
