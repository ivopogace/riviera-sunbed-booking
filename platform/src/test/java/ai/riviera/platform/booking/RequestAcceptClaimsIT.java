package ai.riviera.platform.booking;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.availability.vocabulary.ClaimOutcome;
import ai.riviera.platform.booking.application.request.AcceptOutcome;
import ai.riviera.platform.booking.application.request.PendingRequest;
import ai.riviera.platform.booking.application.request.PendingRequests;
import ai.riviera.platform.booking.application.request.RespondToRequest;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;

/**
 * The venue's accept is the claim (ADR-0025): it holds every day of the request once committed, declines
 * itself {@code SET_UNAVAILABLE} when a day is gone, and declines every overlapping pending request
 * {@code ANOTHER_GUEST}. The stub payment profile confirms synchronously, so an accepted request reads
 * {@code CONFIRMED}; the claim it left behind is what these cases prove.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
		"booking.no-show.enabled=false",
		"booking.request.initial-delay=PT2H",
		"booking.awaiting-payment.initial-delay=PT2H"
})
class RequestAcceptClaimsIT {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	@Autowired
	RespondToRequest respondToRequest;

	@Autowired
	PendingRequests pendingRequests;

	@Autowired
	AvailabilityClaim availability;

	@Autowired
	JdbcClient jdbc;

	private long venueId;
	private OperatorId operator;
	private long setId;
	private LocalDate day;

	@BeforeEach
	void seedRequestVenue() {
		venueId = jdbc.sql("""
				INSERT INTO venue (name, beach, booking_mode, commission_bps, payout_currency)
				VALUES (:name, 'KSAMIL', 'REQUEST', 1500, 'EUR')
				RETURNING id
				""").param("name", "Accept Club " + System.nanoTime()).query(Long.class).single();
		long operatorId = jdbc.sql("INSERT INTO operator (username, status) VALUES (:u, 'ACTIVE') RETURNING id")
				.param("u", "accept-op-" + System.nanoTime()).query(Long.class).single();
		jdbc.sql("INSERT INTO operator_venue (venue_id, operator_id) VALUES (:v, :o)")
				.param("v", venueId).param("o", operatorId).update();
		operator = new OperatorId(operatorId);
		setId = jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:venue, 'A', 1, 'STANDARD', 'ONLINE', 4500, 'EUR', 1, 1)
				RETURNING id
				""").param("venue", venueId).query(Long.class).single();
		day = LocalDate.now(TIRANE).plusDays(10);
	}

	/** A one-day {@code PENDING_REQUEST} on {@code day}, holding nothing. */
	private long insertPending(LocalDate on) {
		return insertPending(on, on);
	}

	/** A {@code PENDING_REQUEST} over {@code first..last} at 4500 a day, holding nothing. */
	private long insertPending(LocalDate first, LocalDate last) {
		String code = "ACPT" + System.nanoTime() % 1_000_000_000L;
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, last_date,
				                     amount_minor, amount_currency, status, request_expires_at)
				VALUES (:code, :venue, :set, :cust, :first, :last, :amount, 'EUR', 'PENDING_REQUEST', :expires)
				RETURNING id
				""")
				.param("code", code).param("venue", venueId).param("set", setId).param("cust", customer)
				.param("first", first).param("last", last)
				.param("amount", 4500L * (last.toEpochDay() - first.toEpochDay() + 1))
				.param("expires", java.sql.Timestamp.from(Instant.now().plusSeconds(3600)))
				.query(Long.class).single();
	}

	private String statusOf(long bookingId) {
		return jdbc.sql("SELECT status FROM booking WHERE id = :id").param("id", bookingId)
				.query(String.class).single();
	}

	private String declineReasonOf(long bookingId) {
		return jdbc.sql("SELECT decline_reason FROM booking WHERE id = :id").param("id", bookingId)
				.query(String.class).optional().orElse(null);
	}

	private long heldRows(LocalDate on) {
		return jdbc.sql("SELECT COUNT(*) FROM set_availability WHERE set_id = :set AND booking_date = :day")
				.param("set", setId).param("day", on).query(Long.class).single();
	}

	@Test
	void acceptClaimsTheDayAndTheClaimOutlivesTheTransaction() {
		long request = insertPending(day);
		assertEquals(0L, heldRows(day), "pending: nothing held");

		AcceptOutcome outcome = respondToRequest.accept(operator, new VenueId(venueId), new BookingId(request));

		assertInstanceOf(AcceptOutcome.Accepted.class, outcome);
		assertEquals("CONFIRMED", statusOf(request), "the stub collects synchronously");
		assertEquals(1L, heldRows(day));
		assertEquals(ClaimOutcome.ALREADY_TAKEN, availability.claim(new SetId(setId), day),
				"the accept's claim stands for every other party");
	}

	@Test
	void acceptOnATakenDayDeclinesTheRequestAsSetUnavailable() {
		long request = insertPending(day);
		jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) VALUES (:set, :day, 'STAFF_MARKED')")
				.param("set", setId).param("day", day).update();

		AcceptOutcome outcome = respondToRequest.accept(operator, new VenueId(venueId), new BookingId(request));

		assertSame(AcceptOutcome.Rejected.SET_UNAVAILABLE, outcome);
		assertEquals("DECLINED", statusOf(request));
		assertEquals("SET_UNAVAILABLE", declineReasonOf(request));
		assertEquals(1L, heldRows(day), "the staff mark is untouched");
	}

	@Test
	void acceptDeclinesEveryOverlappingRivalAndLeavesTheRest() {
		long winner = insertPending(day);
		long rivalSameDay = insertPending(day);
		long rivalAnotherDay = insertPending(day.plusDays(1));

		AcceptOutcome outcome = respondToRequest.accept(operator, new VenueId(venueId), new BookingId(winner));

		assertInstanceOf(AcceptOutcome.Accepted.class, outcome);
		assertEquals("DECLINED", statusOf(rivalSameDay));
		assertEquals("ANOTHER_GUEST", declineReasonOf(rivalSameDay));
		assertEquals("PENDING_REQUEST", statusOf(rivalAnotherDay), "a request on another day is nobody's rival");
		assertNull(declineReasonOf(rivalAnotherDay));
		assertEquals(0L, heldRows(day.plusDays(1)));
	}

	@Test
	void theQueueShowsARangeAsOneRow() {
		long range = insertPending(day, day.plusDays(2));
		insertPending(day.plusDays(1));

		var queue = pendingRequests.forVenue(operator, new VenueId(venueId));

		PendingRequest row = queue.stream().filter(r -> r.bookingId() == range).findFirst().orElseThrow();
		assertEquals(day, row.bookingDate());
		assertEquals(day.plusDays(2), row.lastDate());
		assertEquals(13500L, row.amountMinor(), "the whole stay's total");
		assertEquals(1, row.competingRequests(), "a request on a middle day competes");
	}

	@Test
	void acceptClaimsEveryDayOfARange() {
		long request = insertPending(day, day.plusDays(2));

		AcceptOutcome outcome = respondToRequest.accept(operator, new VenueId(venueId), new BookingId(request));

		assertInstanceOf(AcceptOutcome.Accepted.class, outcome);
		assertEquals("CONFIRMED", statusOf(request));
		for (int i = 0; i < 3; i++) {
			assertEquals(1L, heldRows(day.plusDays(i)), "day " + i + " is claimed");
		}
	}

	@Test
	void aTakenMiddleDayDeclinesTheWholeRangeAndClaimsNothing() {
		long request = insertPending(day, day.plusDays(2));
		jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) VALUES (:set, :day, 'STAFF_MARKED')")
				.param("set", setId).param("day", day.plusDays(1)).update();

		AcceptOutcome outcome = respondToRequest.accept(operator, new VenueId(venueId), new BookingId(request));

		assertSame(AcceptOutcome.Rejected.SET_UNAVAILABLE, outcome);
		assertEquals("DECLINED", statusOf(request));
		assertEquals("SET_UNAVAILABLE", declineReasonOf(request));
		assertEquals(0L, heldRows(day), "the first day is given back");
		assertEquals(0L, heldRows(day.plusDays(2)), "the last day is given back");
		assertEquals(1L, heldRows(day.plusDays(1)), "the staff mark is untouched");
	}

	@Test
	void theQueueCountsEachRequestsCompetitors() {
		long a = insertPending(day);
		long b = insertPending(day);
		insertPending(day.plusDays(1));

		var queue = pendingRequests.forVenue(operator, new VenueId(venueId));

		assertEquals(3, queue.size());
		for (PendingRequest row : queue) {
			int expected = row.bookingId() == a || row.bookingId() == b ? 1 : 0;
			assertEquals(expected, row.competingRequests(), "competitors of request " + row.bookingId());
		}
	}
}
