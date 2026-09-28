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
 * Verifies the ledger migrations create {@code payout_ledger_entry} with the constraints that
 * enforce the ledger invariants (invariant #12): the {@code UNIQUE(booking_id, entry_type)}
 * exactly-once guard (#9), the {@code net = gross − commission} CHECK (#5), the {@code entry_type}
 * CHECK, and the {@code booking_id} FK. A different {@code entry_type} for the same booking (the
 * REVERSAL, and the venue-change FEE) is allowed.
 *
 * <p>A {@code FEE} is the one entry type exempt from the net CHECK: it has no gross and no
 * commission, so {@code (0, 0, fee)} must store while the same shape under any other type must not.
 * The amounts CHECK still binds it — direction lives in the entry type, never in a negative amount.
 * Testcontainers + real Flyway; skipped where Docker is absent.
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
		insertEntry(bookingId, type, null, gross, commission, net);
	}

	private void insertEntry(long bookingId, String type, LocalDate serviceDate, long gross, long commission,
			long net) {
		long venue = jdbc.sql("SELECT venue_id FROM booking WHERE id = :id")
				.param("id", bookingId).query(Long.class).single();
		jdbc.sql("""
				INSERT INTO payout_ledger_entry (venue_id, booking_id, entry_type, service_date, gross_minor,
				                                 commission_minor, net_minor, currency)
				VALUES (:venue, :booking, :type, :day, :gross, :commission, :net, 'EUR')
				""")
				.param("venue", venue).param("booking", bookingId).param("type", type).param("day", serviceDate)
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
				"entry_type CHECK admits only ACCRUAL | REVERSAL | FEE | DAY_REVERSAL.");
	}

	@Test
	void feeRowIsAdmittedWithNoGrossAndNoCommission() {
		long booking = insertBooking("PAYMIG0006");
		insertEntry(booking, "ACCRUAL", 4500, 675, 3825);

		assertDoesNotThrow(() -> insertEntry(booking, "FEE", 0, 0, 500),
				"a fee has no gross and no commission, so the net CHECK exempts FEE.");
	}

	@Test
	void feeRowWithNegativeAmountRejected() {
		long booking = insertBooking("PAYMIG0007");
		assertThrows(DataIntegrityViolationException.class,
				() -> insertEntry(booking, "FEE", 0, 0, -500),
				"the amounts CHECK still binds a fee: direction lives in the entry type, not the sign.");
	}

	@Test
	void secondFeeForSameBookingRejected() {
		long booking = insertBooking("PAYMIG0008");
		insertEntry(booking, "FEE", 0, 0, 500);

		assertThrows(DataIntegrityViolationException.class,
				() -> insertEntry(booking, "FEE", 0, 0, 500),
				"UNIQUE(booking_id, entry_type) is the fee's idempotency guard too (invariant #9).");
	}

	@Test
	void oneDayReversalPerBookingAndDay() {
		// V69: the exactly-once key gains the day; a second storm date is a second row.
		long booking = insertBooking("PAYMIG0009");
		LocalDate day = LocalDate.of(2029, 7, 8);
		insertEntry(booking, "ACCRUAL", 42000, 6300, 35700);
		insertEntry(booking, "DAY_REVERSAL", day, 3000, 450, 2550);

		assertThrows(DataIntegrityViolationException.class,
				() -> insertEntry(booking, "DAY_REVERSAL", day, 3000, 450, 2550),
				"UNIQUE (booking_id, entry_type, service_date) reverses a day at most once (invariant #9).");
		assertDoesNotThrow(() -> insertEntry(booking, "DAY_REVERSAL", day.plusDays(1), 3000, 450, 2550),
				"another storm date is another day's reversal");
		assertDoesNotThrow(() -> insertEntry(booking, "REVERSAL", 36000, 5400, 30600),
				"the whole-booking REVERSAL sits beside the day reversals");
	}

	@Test
	void aDayReversalNamesItsDayAndNothingElseDoes() {
		long booking = insertBooking("PAYMIG0010");
		assertThrows(DataIntegrityViolationException.class,
				() -> insertEntry(booking, "DAY_REVERSAL", 3000, 450, 2550),
				"a DAY_REVERSAL without its service_date has no key");
		assertThrows(DataIntegrityViolationException.class,
				() -> insertEntry(booking, "REVERSAL", LocalDate.of(2029, 7, 8), 3000, 450, 2550),
				"a service_date on any other type would split its one-per-booking guard");
	}

	@Test
	void datelessTypesStayOnePerBooking() {
		// NULLS NOT DISTINCT: two NULL service dates collide, so V9's guard is unchanged for them.
		long booking = insertBooking("PAYMIG0011");
		insertEntry(booking, "REVERSAL", 4500, 675, 3825);
		assertThrows(DataIntegrityViolationException.class,
				() -> insertEntry(booking, "REVERSAL", 4500, 675, 3825),
				"one REVERSAL per booking, ever (invariant #9)");
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
