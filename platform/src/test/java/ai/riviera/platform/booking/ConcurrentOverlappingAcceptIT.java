package ai.riviera.platform.booking;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.RepeatedTest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.application.request.AcceptOutcome;
import ai.riviera.platform.booking.application.request.RespondToRequest;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Two operators accept two pending requests for the same set and day at once (ADR-0025, invariant #2):
 * exactly one request holds the day and the other is {@code DECLINED} — by the winner's rival decline
 * ({@code ANOTHER_GUEST}) or by its own lost claim ({@code SET_UNAVAILABLE}) — and the losing accept
 * answers a value, never an exception.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
		"booking.no-show.enabled=false",
		"booking.request.initial-delay=PT2H",
		"booking.awaiting-payment.initial-delay=PT2H"
})
class ConcurrentOverlappingAcceptIT {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	@Autowired
	RespondToRequest respondToRequest;

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
				""").param("name", "Rival Club " + System.nanoTime()).query(Long.class).single();
		long operatorId = jdbc.sql("INSERT INTO operator (username, status) VALUES (:u, 'ACTIVE') RETURNING id")
				.param("u", "rival-op-" + System.nanoTime()).query(Long.class).single();
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

	private long insertPending() {
		String code = "RIVL" + System.nanoTime() % 1_000_000_000L;
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, last_date,
				                     amount_minor, amount_currency, status, request_expires_at)
				VALUES (:code, :venue, :set, :cust, :day, :day, 4500, 'EUR', 'PENDING_REQUEST', :expires)
				RETURNING id
				""")
				.param("code", code).param("venue", venueId).param("set", setId).param("cust", customer)
				.param("day", day).param("expires", java.sql.Timestamp.from(Instant.now().plusSeconds(3600)))
				.query(Long.class).single();
	}

	@RepeatedTest(3)
	void exactlyOneAcceptWins() throws Exception {
		long a = insertPending();
		long b = insertPending();
		CountDownLatch gate = new CountDownLatch(1);
		Callable<AcceptOutcome> acceptA = () -> {
			gate.await();
			return respondToRequest.accept(operator, new VenueId(venueId), new BookingId(a));
		};
		Callable<AcceptOutcome> acceptB = () -> {
			gate.await();
			return respondToRequest.accept(operator, new VenueId(venueId), new BookingId(b));
		};
		List<AcceptOutcome> outcomes;
		try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
			Future<AcceptOutcome> fa = pool.submit(acceptA);
			Future<AcceptOutcome> fb = pool.submit(acceptB);
			gate.countDown();
			outcomes = List.of(fa.get(), fb.get());
		}

		long won = outcomes.stream().filter(AcceptOutcome.Accepted.class::isInstance).count();
		assertEquals(1, won, "exactly one accept wins the day (invariant #2): " + outcomes);
		List<String> statuses = jdbc.sql("SELECT status FROM booking WHERE id IN (:a, :b) ORDER BY status")
				.param("a", a).param("b", b).query(String.class).list();
		assertEquals(List.of("CONFIRMED", "DECLINED"), statuses, "the stub confirms the winner; the loser is declined");
		String loserReason = jdbc.sql("SELECT decline_reason FROM booking WHERE id IN (:a, :b) AND status = 'DECLINED'")
				.param("a", a).param("b", b).query(String.class).single();
		assertTrue(List.of("ANOTHER_GUEST", "SET_UNAVAILABLE").contains(loserReason), loserReason);
		assertEquals(1L, jdbc.sql("SELECT COUNT(*) FROM set_availability WHERE set_id = :set AND booking_date = :day")
				.param("set", setId).param("day", day).query(Long.class).single(), "one row per (set, day)");
	}
}
