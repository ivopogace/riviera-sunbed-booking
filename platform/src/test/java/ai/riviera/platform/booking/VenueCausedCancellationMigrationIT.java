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
import ai.riviera.platform.booking.application.remodel.ReceiptOutcomeKind;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * V53: {@code remodel_receipt.refund_reason} is present and starts null; every
 * {@link ReceiptOutcomeKind} passes the outcome CHECK and an unknown token does not; a negative
 * amount and an orphan receipt are refused; every FK column carries an index; and the recorded set
 * id survives its set row, because a receipt line outlives the map it describes.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class VenueCausedCancellationMigrationIT {

	@Autowired
	JdbcClient jdbc;

	@Test
	void receiptOutcomeTableHoldsItsShape() {
		long venue = insertVenue("Outcome Shape");
		long set = insertSet(venue, 1);
		long booking = insertBooking(venue, set, insertCustomer());
		long receipt = insertReceipt(venue);
		assertNull(jdbc.sql("SELECT refund_reason FROM remodel_receipt WHERE id = :r").param("r", receipt)
				.query(String.class).optional().orElse(null));

		for (ReceiptOutcomeKind kind : ReceiptOutcomeKind.values()) {
			assertDoesNotThrow(() -> insertOutcome(receipt, booking, set, kind.name(), 2000), kind + " is admitted");
		}
		assertThrows(DataIntegrityViolationException.class,
				() -> insertOutcome(receipt, booking, set, "FORGIVEN", 2000), "an unknown kind is refused");
		assertThrows(DataIntegrityViolationException.class,
				() -> insertOutcome(receipt, booking, set, "REFUND", -1), "a negative amount is refused");
		assertThrows(DataIntegrityViolationException.class,
				() -> insertOutcome(receipt + 100_000, booking, set, "REFUND", 2000), "an orphan receipt is refused");

		assertDoesNotThrow(() -> jdbc.sql("UPDATE remodel_receipt SET refund_reason = :why WHERE id = :r")
				.param("why", "Re-laying row A for the season").param("r", receipt).update());

		List<String> indexed = jdbc.sql("""
				SELECT indexdef FROM pg_indexes WHERE tablename = 'remodel_receipt_outcome'
				""").query(String.class).list();
		for (String column : List.of("(receipt_id", "(booking_id")) {
			assertTrue(indexed.stream().anyMatch(def -> def.contains(column)), column + " is indexed: " + indexed);
		}
		assertEquals(ReceiptOutcomeKind.values().length,
				jdbc.sql("SELECT COUNT(*) FROM remodel_receipt_outcome WHERE receipt_id = :r")
						.param("r", receipt).query(Integer.class).single());
	}

	@Test
	void theSpotIsRecordedWithoutAForeignKey() {
		long venue = insertVenue("Recorded Spot");
		long set = insertSet(venue, 1);
		long booking = insertBooking(venue, set, insertCustomer());
		long receipt = insertReceipt(venue);
		long vanished = set + 100_000;

		assertDoesNotThrow(() -> insertOutcome(receipt, booking, vanished, "DECLINE", 0),
				"the spot is a recorded id, so a set row need not exist for it");
		assertEquals(vanished, jdbc.sql("SELECT set_id FROM remodel_receipt_outcome WHERE receipt_id = :r")
				.param("r", receipt).query(Long.class).single());
	}

	private void insertOutcome(long receipt, long booking, long set, String kind, long amountMinor) {
		jdbc.sql("""
				INSERT INTO remodel_receipt_outcome (receipt_id, booking_id, booking_date, kind, set_id, row_label,
				    position_no, amount_minor, amount_currency)
				VALUES (:r, :b, :d, :kind, :set, 'A', 1, :amount, 'EUR')
				""").param("r", receipt).param("b", booking).param("d", LocalDate.of(2027, 7, 1)).param("kind", kind)
				.param("set", set).param("amount", amountMinor).update();
	}

	private long insertReceipt(long venue) {
		long operator = jdbc.sql("INSERT INTO operator (username, status) VALUES (:u, 'ACTIVE') RETURNING id")
				.param("u", "v53-" + System.nanoTime()).query(Long.class).single();
		return jdbc.sql("""
				INSERT INTO remodel_receipt (venue_id, operator_id, committed_at) VALUES (:v, :o, now()) RETURNING id
				""").param("v", venue).param("o", operator).query(Long.class).single();
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
				.param("e", "v53-" + System.nanoTime() + "@example.test").query(Long.class).single();
	}

	private long insertBooking(long venue, long set, long customer) {
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, amount_minor, amount_currency, status)
				VALUES (:code, :v, :s, :c, '2027-07-01', 2000, 'EUR', 'CONFIRMED') RETURNING id
				""").param("code", "V53-" + System.nanoTime()).param("v", venue).param("s", set).param("c", customer)
				.query(Long.class).single();
	}
}
