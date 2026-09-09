package ai.riviera.platform.booking.adapter.out;

import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.application.remodel.ReceiptMove;
import ai.riviera.platform.booking.application.remodel.RemodelReceipt;
import ai.riviera.platform.booking.application.remodel.RemodelReceipts;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.ReceiptId;
import ai.riviera.platform.booking.vocabulary.SpotRef;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The receipt round trip against a real Postgres: a receipt with two moves reads back whole, newest
 * first per venue, by id only for its own venue, and a booking's latest move is the last one written.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class JdbcRemodelReceiptsIT {

	private static final LocalDate DAY = LocalDate.of(2027, 7, 12);

	@Autowired
	RemodelReceipts receipts;

	@Autowired
	JdbcClient jdbc;

	@Test
	void aReceiptReadsBackWholeNewestFirstAndOnlyForItsVenue() {
		long venue = insertVenue();
		long other = insertVenue();
		long a1 = insertSet(venue, 1);
		long a2 = insertSet(venue, 2);
		long a3 = insertSet(venue, 3);
		long booking = insertBooking(venue, a2);
		long later = insertBooking(venue, a3);
		OperatorId operator = new OperatorId(insertOperator());
		Instant first = Instant.parse("2026-09-09T10:00:00Z");
		SpotRef fromA1 = new SpotRef(new SetId(a1), "A", 1);
		SpotRef toA2 = new SpotRef(new SetId(a2), "A", 2);
		SpotRef toA3 = new SpotRef(new SetId(a3), "A", 3);

		ReceiptId earlier = receipts.store(new VenueId(venue), operator, first, List.of(
				new ReceiptMove(new BookingId(booking), DAY, fromA1, toA2, 0, 1)));
		ReceiptId newest = receipts.store(new VenueId(venue), operator, first.plus(1, ChronoUnit.HOURS), List.of(
				new ReceiptMove(new BookingId(booking), DAY, toA2, toA3, 0, 1),
				new ReceiptMove(new BookingId(later), DAY.plusDays(1), fromA1, toA3, 0, 2)));

		List<RemodelReceipt> listed = receipts.receiptsOf(new VenueId(venue));
		assertEquals(List.of(newest, earlier), listed.stream().map(RemodelReceipt::id).toList());
		assertEquals(2, listed.get(0).moves().size());
		assertEquals(new ReceiptMove(new BookingId(booking), DAY, fromA1, toA2, 0, 1),
				listed.get(1).moves().getFirst());
		assertEquals(operator, listed.get(0).operatorId());
		assertEquals(first, listed.get(1).committedAt());

		Optional<RemodelReceipt> found = receipts.find(new VenueId(venue), earlier);
		assertTrue(found.isPresent());
		assertEquals(1, found.get().moves().size());
		assertTrue(receipts.find(new VenueId(other), earlier).isEmpty(), "another venue's id reads as absent");
		assertTrue(receipts.receiptsOf(new VenueId(other)).isEmpty());

		assertEquals(Optional.of(new ReceiptMove(new BookingId(booking), DAY, toA2, toA3, 0, 1)),
				receipts.latestMoveOf(new BookingId(booking)), "the last move written is the latest");
		assertTrue(receipts.latestMoveOf(new BookingId(booking + 100_000)).isEmpty());
	}

	private long insertVenue() {
		return jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES (:name, 'Ksamil', 'Riviera', 'INSTANT', 1500, 'EUR') RETURNING id
				""").param("name", "Receipts " + System.nanoTime()).query(Long.class).single();
	}

	private long insertSet(long venue, int position) {
		return jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor, price_currency, grid_x, grid_y)
				VALUES (:v, 'A', :pos, 'STANDARD', 'ONLINE', 2000, 'EUR', :pos, 1) RETURNING id
				""").param("v", venue).param("pos", position).query(Long.class).single();
	}

	private long insertOperator() {
		return jdbc.sql("INSERT INTO operator (username, status) VALUES (:u, 'ACTIVE') RETURNING id")
				.param("u", "receipts-" + System.nanoTime()).query(Long.class).single();
	}

	private long insertBooking(long venue, long set) {
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) VALUES (:e, 'Guest', '+355000') RETURNING id")
				.param("e", "receipts-" + System.nanoTime() + "@example.test").query(Long.class).single();
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, amount_minor, amount_currency, status)
				VALUES (:code, :v, :s, :c, :d, 2000, 'EUR', 'CONFIRMED') RETURNING id
				""").param("code", "RCPT-" + System.nanoTime()).param("v", venue).param("s", set).param("c", customer)
				.param("d", DAY).query(Long.class).single();
	}
}
