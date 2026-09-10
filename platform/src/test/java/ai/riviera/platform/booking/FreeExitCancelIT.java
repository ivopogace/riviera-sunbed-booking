package ai.riviera.platform.booking;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

import org.awaitility.Awaitility;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.OwnershipFixtures;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.application.remodel.NewReceipt;
import ai.riviera.platform.booking.application.remodel.ReceiptMove;
import ai.riviera.platform.booking.application.remodel.RemodelReceipts;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.SpotRef;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The free exit at the HTTP seam (invariant #10): a booking a remodel moved, inside the LATE window
 * of a 00:00-cutoff venue (so the window is LATE at every hour the suite runs) and before its exit
 * deadline, shows the move and the deadline on the view, quotes the full amount, and cancels with
 * tier {@code FULL} and reason {@code VENUE_CHANGE} on the booking and on the ledger reversal — while
 * an unmoved neighbour in the same window still gets the venue's 50% share. The deadline arithmetic
 * itself is {@code BookingCutoffFreeExitTest}'s; the after-the-deadline and CLOSED arms are
 * {@code CancellationPolicyFreeExitTest}'s.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class FreeExitCancelIT {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	RemodelReceipts receipts;

	@Test
	void aMovedBookingInsideItsExitCancelsInFullAsAVenueChangeWhileAnUnmovedOneKeepsTheLateShare() throws Exception {
		LocalDate tomorrow = LocalDate.now(TIRANE).plusDays(1);
		long venue = insertLateRefundVenue();
		long a1 = insertSet(venue, 1);
		long a2 = insertSet(venue, 2);
		long a3 = insertSet(venue, 3);
		String movedCode = "FXMV" + (System.nanoTime() % 1_000_000);
		String stayedCode = "FXST" + (System.nanoTime() % 1_000_000);
		long moved = seedConfirmed(venue, a2, movedCode, tomorrow);
		long stayed = seedConfirmed(venue, a3, stayedCode, tomorrow);
		Instant movedAt = Instant.now().minus(Duration.ofHours(1));
		jdbc.sql("UPDATE booking SET moved_at = :at WHERE id = :id").param("at", java.sql.Timestamp.from(movedAt))
				.param("id", moved).update();
		receipts.store(new NewReceipt(new VenueId(venue), bootstrapOperator(), movedAt, List.of(new ReceiptMove(
				new BookingId(moved), tomorrow, new SpotRef(new SetId(a1), "A", 1), new SpotRef(new SetId(a2), "A", 2), 0, 1)), List.of(), ""));
		accrue(venue, moved);

		mvc.perform(get("/api/bookings/{code}", movedCode))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.beforeCutoff").value(false))
				.andExpect(jsonPath("$.cancellable").value(true))
				.andExpect(jsonPath("$.refundIfCancelledNow.minorUnits").value(4500))
				.andExpect(jsonPath("$.move.fromRowLabel").value("A"))
				.andExpect(jsonPath("$.move.fromPositionNo").value(1))
				.andExpect(jsonPath("$.move.positionsAway").value(1))
				.andExpect(jsonPath("$.move.movedAt").isString())
				.andExpect(jsonPath("$.move.freeExitUntil").isString())
				.andExpect(jsonPath("$.rowLabel").value("A"))
				.andExpect(jsonPath("$.positionNo").value(2));
		mvc.perform(get("/api/bookings/{code}", stayedCode))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.refundIfCancelledNow.minorUnits").value(2250))
				.andExpect(jsonPath("$.move").doesNotExist());

		mvc.perform(post("/api/bookings/{code}/cancel", movedCode))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.tier").value("FULL"))
				.andExpect(jsonPath("$.refund.minorUnits").value(4500));
		assertEquals("VENUE_CHANGE", jdbc.sql("SELECT cancel_reason FROM booking WHERE id = :id").param("id", moved)
				.query(String.class).single());
		assertEquals(0, jdbc.sql("SELECT COUNT(*) FROM set_availability WHERE set_id = :s AND booking_date = :d")
				.param("s", a2).param("d", tomorrow).query(Integer.class).single(), "the exit frees the new spot");
		Awaitility.await().atMost(Duration.ofSeconds(15)).until(() -> "VENUE_CHANGE".equals(jdbc.sql(
				"SELECT reason FROM payout_ledger_entry WHERE booking_id = :b AND entry_type = 'REVERSAL'")
				.param("b", moved).query(String.class).optional().orElse(null)));
		assertEquals(4500L, jdbc.sql("SELECT gross_minor FROM payout_ledger_entry WHERE booking_id = :b AND entry_type = 'REVERSAL'")
				.param("b", moved).query(Long.class).single(), "the reversal is the full amount");
		mvc.perform(get("/api/bookings/{code}", movedCode))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("CANCELLED"))
				.andExpect(jsonPath("$.cancelReason").value("VENUE_CHANGE"))
				.andExpect(content().string(not(containsString("\"refundedAmount\":null"))));

		mvc.perform(post("/api/bookings/{code}/cancel", stayedCode))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.tier").value("PARTIAL"))
				.andExpect(jsonPath("$.refund.minorUnits").value(2250));
		assertEquals("POLICY", jdbc.sql("SELECT cancel_reason FROM booking WHERE id = :id").param("id", stayed)
				.query(String.class).single());
	}

	private long insertLateRefundVenue() {
		long venueId = jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency,
				                   late_cancel_refund_bps, booking_cutoff)
				VALUES (:name, 'Test Beach', 'Riviera', 'INSTANT', 1500, 'EUR', 5000, TIME '00:00')
				RETURNING id
				""").param("name", "Free Exit Club " + System.nanoTime()).query(Long.class).single();
		OwnershipFixtures.grantToBootstrap(jdbc, venueId);
		return venueId;
	}

	private long insertSet(long venue, int position) {
		return jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor, price_currency, grid_x, grid_y)
				VALUES (:v, 'A', :pos, 'STANDARD', 'ONLINE', 4500, 'EUR', :pos, 1) RETURNING id
				""").param("v", venue).param("pos", position).query(Long.class).single();
	}

	private long seedConfirmed(long venue, long set, String code, LocalDate date) {
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) VALUES (:e, 'Exit Guest', '+355600') RETURNING id")
				.param("e", code + "@example.test").query(Long.class).single();
		Instant createdAt = date.atStartOfDay(TIRANE).toInstant().minus(Duration.ofDays(3));
		jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) VALUES (:s, :d, 'BOOKED_ONLINE')")
				.param("s", set).param("d", date).update();
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, amount_minor, amount_currency,
				                     status, confirmed_at, created_at)
				VALUES (:code, :v, :s, :c, :d, 4500, 'EUR', 'CONFIRMED', NOW(), :createdAt) RETURNING id
				""").param("code", code).param("v", venue).param("s", set).param("c", customer).param("d", date)
				.param("createdAt", java.sql.Timestamp.from(createdAt)).query(Long.class).single();
	}

	private void accrue(long venue, long booking) {
		jdbc.sql("""
				INSERT INTO payout_ledger_entry (venue_id, booking_id, entry_type, gross_minor, commission_minor, net_minor, currency)
				VALUES (:v, :b, 'ACCRUAL', 4500, 675, 3825, 'EUR')
				""").param("v", venue).param("b", booking).update();
	}

	private OperatorId bootstrapOperator() {
		return new OperatorId(jdbc.sql("SELECT id FROM operator ORDER BY id LIMIT 1").query(Long.class).single());
	}
}
