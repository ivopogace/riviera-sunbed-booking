package ai.riviera.platform.payout;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Verifies the U5 migration (V9, issue #9) creates {@code payout_ledger_entry} with the constraints
 * that enforce the ledger invariants (invariant #12): the {@code UNIQUE(booking_id, entry_type)}
 * exactly-once guard (#9), the {@code net = gross − commission} CHECK (#5), the {@code entry_type}
 * CHECK, and the {@code booking_id} FK. A different {@code entry_type} for the same booking (the
 * future REVERSAL, U6) is allowed. Testcontainers + real Flyway; skipped where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class PayoutMigrationIT {

	@Autowired
	JdbcClient jdbc;

	private long insertBooking(String code) {
		var set = jdbc.sql("SELECT id, venue_id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1")
				.query((rs, n) -> new long[] {rs.getLong("id"), rs.getLong("venue_id")}).single();
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status)
				VALUES (:code, :venue, :set, :cust, :date, 4500, 'EUR', 'CONFIRMED')
				RETURNING id
				""")
				.param("code", code).param("venue", set[1]).param("set", set[0])
				.param("cust", customer).param("date", LocalDate.of(2029, 7, 1))
				.query(Long.class).single();
	}

	private void insertEntry(long bookingId, String type, long gross, long commission, long net) {
		long venue = jdbc.sql("SELECT venue_id FROM booking WHERE id = :id")
				.param("id", bookingId).query(Long.class).single();
		jdbc.sql("""
				INSERT INTO payout_ledger_entry (venue_id, booking_id, entry_type, gross_minor,
				                                 commission_minor, net_minor, currency)
				VALUES (:venue, :booking, :type, :gross, :commission, :net, 'EUR')
				""")
				.param("venue", venue).param("booking", bookingId).param("type", type)
				.param("gross", gross).param("commission", commission).param("net", net)
				.update();
	}

	@Test
	void secondAccrualForSameBookingRejected() {
		long booking = insertBooking("PAYMIG0001");
		insertEntry(booking, "ACCRUAL", 4500, 675, 3825);

		assertThrows(DataIntegrityViolationException.class,
				() -> insertEntry(booking, "ACCRUAL", 4500, 675, 3825),
				"UNIQUE(booking_id, entry_type) is the exactly-once accrual guard (invariant #9).");
	}

	@Test
	void reversalAllowedAlongsideAccrual() {
		long booking = insertBooking("PAYMIG0002");
		insertEntry(booking, "ACCRUAL", 4500, 675, 3825);

		assertDoesNotThrow(() -> insertEntry(booking, "REVERSAL", 4500, 675, 3825),
				"a different entry_type for the same booking is allowed (the U6 refund reversal).");
	}

	@Test
	void inconsistentNetRejected() {
		long booking = insertBooking("PAYMIG0003");
		assertThrows(DataIntegrityViolationException.class,
				() -> insertEntry(booking, "ACCRUAL", 4500, 675, 9999),
				"CHECK net = gross - commission must reject a miscomputed entry (invariant #5).");
	}

	@Test
	void unknownEntryTypeRejected() {
		long booking = insertBooking("PAYMIG0004");
		assertThrows(DataIntegrityViolationException.class,
				() -> insertEntry(booking, "BONUS", 4500, 675, 3825),
				"entry_type CHECK admits only ACCRUAL | REVERSAL.");
	}

	@Test
	void entryForUnknownBookingRejected() {
		assertThrows(DataIntegrityViolationException.class,
				() -> jdbc.sql("""
						INSERT INTO payout_ledger_entry (venue_id, booking_id, entry_type, gross_minor,
						                                 commission_minor, net_minor, currency)
						VALUES (1, 999999999, 'ACCRUAL', 4500, 675, 3825, 'EUR')
						""").update(),
				"booking_id FK must reject a ledger entry for a non-existent booking.");
	}
}
