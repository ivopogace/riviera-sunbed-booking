package ai.riviera.platform.booking;

import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.vocabulary.RefundReason;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * V52: {@code booking.moved_at} is present and starts null; every {@link RefundReason} — the fourth,
 * {@code VENUE_CHANGE}, included — passes both reason CHECKs; the receipt tables refuse a negative
 * distance, a move onto the same set and an orphan receipt; and every FK column carries an index.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class RemodelCommitMigrationIT {

	@Autowired
	JdbcClient jdbc;

	@Test
	void movedAtStartsNullAndEveryReasonPassesBothChecks() {
		long venue = insertVenue("Reason Lockstep");
		long set = insertSet(venue, 1);
		long customer = insertCustomer();
		long booking = insertBooking(venue, set, customer);
		assertNull(jdbc.sql("SELECT moved_at FROM booking WHERE id = :id").param("id", booking)
				.query(java.sql.Timestamp.class).optional().orElse(null));

		for (RefundReason reason : RefundReason.values()) {
			assertDoesNotThrow(() -> jdbc.sql("UPDATE booking SET cancel_reason = :r WHERE id = :id")
					.param("r", reason.name()).param("id", booking).update(), reason + " on booking");
			long accrual = jdbc.sql("""
					INSERT INTO payout_ledger_entry (booking_id, venue_id, entry_type, gross_minor, commission_minor, net_minor, currency, reason)
					VALUES (:b, :v, 'ACCRUAL', 2000, 300, 1700, 'EUR', NULL) RETURNING id
					""").param("b", booking).param("v", venue).query(Long.class).single();
			assertDoesNotThrow(() -> jdbc.sql("UPDATE payout_ledger_entry SET reason = :r WHERE id = :id")
					.param("r", reason.name()).param("id", accrual).update(), reason + " on the ledger");
			jdbc.sql("DELETE FROM payout_ledger_entry WHERE id = :id").param("id", accrual).update();
		}
		assertThrows(DataIntegrityViolationException.class, () ->
				jdbc.sql("UPDATE booking SET cancel_reason = 'WHIM' WHERE id = :id").param("id", booking).update());
	}

	@Test
	void receiptTablesHoldTheirShape() {
		long venue = insertVenue("Receipt Shape");
		long from = insertSet(venue, 1);
		long to = insertSet(venue, 2);
		long booking = insertBooking(venue, to, insertCustomer());
		long operator = jdbc.sql("INSERT INTO operator (username, status) VALUES (:u, 'ACTIVE') RETURNING id")
				.param("u", "receipt-shape-" + System.nanoTime()).query(Long.class).single();
		long receipt = jdbc.sql("""
				INSERT INTO remodel_receipt (venue_id, operator_id, committed_at) VALUES (:v, :o, now()) RETURNING id
				""").param("v", venue).param("o", operator).query(Long.class).single();

		assertDoesNotThrow(() -> insertMove(receipt, booking, from, to, 0, 1));
		assertThrows(DataIntegrityViolationException.class, () -> insertMove(receipt, booking, from, to, -1, 1),
				"a negative distance is refused");
		assertThrows(DataIntegrityViolationException.class, () -> insertMove(receipt, booking, from, from, 0, 0),
				"a move onto the same set is refused");
		assertThrows(DataIntegrityViolationException.class, () -> insertMove(receipt + 100_000, booking, from, to, 0, 1),
				"an orphan receipt is refused");

		List<String> indexed = jdbc.sql("""
				SELECT indexdef FROM pg_indexes WHERE tablename IN ('remodel_receipt', 'remodel_receipt_move')
				""").query(String.class).list();
		for (String column : List.of("(venue_id", "(operator_id", "(receipt_id", "(booking_id", "(from_set_id", "(to_set_id")) {
			assertTrue(indexed.stream().anyMatch(def -> def.contains(column)), column + " is indexed: " + indexed);
		}
		assertEquals(1, jdbc.sql("SELECT COUNT(*) FROM remodel_receipt_move WHERE receipt_id = :r")
				.param("r", receipt).query(Integer.class).single());

		// The actor is a recorded id, not a foreign key: the receipt outlives the operator row.
		assertDoesNotThrow(() -> jdbc.sql("DELETE FROM operator WHERE id = :o").param("o", operator).update());
		assertEquals(operator, jdbc.sql("SELECT operator_id FROM remodel_receipt WHERE id = :r")
				.param("r", receipt).query(Long.class).single());
	}

	private void insertMove(long receipt, long booking, long from, long to, int rowsAway, int positionsAway) {
		jdbc.sql("""
				INSERT INTO remodel_receipt_move (receipt_id, booking_id, booking_date, from_set_id, from_row_label,
				    from_position_no, to_set_id, to_row_label, to_position_no, rows_away, positions_away)
				VALUES (:r, :b, :d, :from, 'A', 1, :to, 'A', 2, :rows, :positions)
				""").param("r", receipt).param("b", booking).param("d", LocalDate.of(2027, 7, 1))
				.param("from", from).param("to", to).param("rows", rowsAway).param("positions", positionsAway)
				.update();
	}

	private long insertVenue(String name) {
		return jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES (:name, 'Ksamil', 'Riviera', 'INSTANT', 1500, 'EUR') RETURNING id
				""").param("name", name + " " + System.nanoTime()).query(Long.class).single();
	}

	private long insertSet(long venue, int position) {
		return jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor, price_currency, grid_x, grid_y)
				VALUES (:v, 'A', :pos, 'STANDARD', 'ONLINE', 2000, 'EUR', :pos, 1) RETURNING id
				""").param("v", venue).param("pos", position).query(Long.class).single();
	}

	private long insertCustomer() {
		return jdbc.sql("INSERT INTO customer (email, full_name, phone) VALUES (:e, 'Guest', '+355000') RETURNING id")
				.param("e", "v52-" + System.nanoTime() + "@example.test").query(Long.class).single();
	}

	private long insertBooking(long venue, long set, long customer) {
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, amount_minor, amount_currency, status)
				VALUES (:code, :v, :s, :c, '2027-07-01', 2000, 'EUR', 'CONFIRMED') RETURNING id
				""").param("code", "V52-" + System.nanoTime()).param("v", venue).param("s", set).param("c", customer)
				.query(Long.class).single();
	}
}
