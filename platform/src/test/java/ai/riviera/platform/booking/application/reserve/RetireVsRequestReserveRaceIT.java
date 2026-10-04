package ai.riviera.platform.booking.application.reserve;

import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.awaitility.Awaitility;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.customer.vocabulary.GuestContact;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.application.ChangeOutcome;
import ai.riviera.platform.venue.application.EditBeachMap;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

/**
 * A single-set retire and a Request-to-Book reserve for that set serialize on its row (#1284). The retire locks
 * the set {@code FOR UPDATE} and takes no venue lock, so the reserve's venue {@code FOR SHARE} does not order the
 * two: the reserve's own read through the active view must wait for the retire and then find no set, or a pending
 * request lands on a set that has left the map. Each race holds the retire's transaction open until the reserve
 * is seen blocked by it ({@code pg_blocking_pids}).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {"booking.no-show.enabled=false", "booking.awaiting-payment.initial-delay=PT2H"})
class RetireVsRequestReserveRaceIT {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	@Autowired
	ReserveSetService reserveSet;

	@Autowired
	ReserveStayService reserveStay;

	@Autowired
	EditBeachMap editBeachMap;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	PlatformTransactionManager txManager;

	private final LocalDate day = LocalDate.now(TIRANE).plusDays(30);
	private long venueId;
	private long operatorId;
	private long setA;
	private long setB;
	private OperatorId owner;

	@BeforeEach
	void seedVenue() {
		venueId = jdbc.sql("""
				INSERT INTO venue (name, beach, booking_mode, commission_bps, payout_currency)
				VALUES (:name, 'KSAMIL', 'REQUEST', 1500, 'EUR') RETURNING id
				""").param("name", "Retire Race " + System.nanoTime()).query(Long.class).single();
		operatorId = jdbc.sql("INSERT INTO operator (username, status) VALUES (:u, 'ACTIVE') RETURNING id")
				.param("u", "retire-race-" + System.nanoTime()).query(Long.class).single();
		jdbc.sql("INSERT INTO operator_venue (venue_id, operator_id) VALUES (:v, :o)")
				.param("v", venueId).param("o", operatorId).update();
		owner = new OperatorId(operatorId);
		setA = insertSet(1);
		setB = insertSet(2);
		insertFinishedBooking(setA);
		insertFinishedBooking(setB);
	}

	@AfterEach
	void removeVenue() {
		jdbc.sql("DELETE FROM booking WHERE venue_id = :v").param("v", venueId).update();
		jdbc.sql("DELETE FROM stay WHERE venue_id = :v").param("v", venueId).update();
		jdbc.sql("DELETE FROM set_position WHERE venue_id = :v").param("v", venueId).update();
		jdbc.sql("DELETE FROM operator_venue WHERE venue_id = :v").param("v", venueId).update();
		jdbc.sql("DELETE FROM operator WHERE id = :o").param("o", operatorId).update();
		jdbc.sql("DELETE FROM venue WHERE id = :v").param("v", venueId).update();
		jdbc.sql("DELETE FROM customer WHERE email LIKE 'retire-race-%'").update();
	}

	@Test
	void aRequestWaitsForAnInFlightRetireAndIsRefused() throws Exception {
		ReserveOutcome reserved = whileHeld(() -> retire(setA),
				() -> reserveSet.reserve(new CreateBookingCommand(new SetId(setA), day, day, guest(), null)));

		assertEquals(new ReserveOutcome.Rejected(BookingOutcome.Rejected.NO_SUCH_SET), reserved,
				"the reserve read the set after the retire committed");
		assertEquals(0L, pendingRequests(), "and no request landed on the retired set");
	}

	@Test
	void aStayRequestWaitsForAnInFlightRetireAndIsRefused() throws Exception {
		CreateStayCommand stay = new CreateStayCommand(List.of(
				new CreateStayCommand.Stretch(new SetId(setA), day, day),
				new CreateStayCommand.Stretch(new SetId(setB), day.plusDays(1), day.plusDays(1))), guest(), null);

		StayReserveOutcome reserved = whileHeld(() -> retire(setB), () -> reserveStay.reserve(stay));

		assertEquals(new StayReserveOutcome.Rejected(BookingOutcome.Rejected.NO_SUCH_SET), reserved);
		assertEquals(0L, pendingRequests());
	}

	private void retire(long set) {
		assertInstanceOf(ChangeOutcome.Applied.class, editBeachMap.removeSet(owner, new VenueId(venueId), new SetId(set)));
	}

	/**
	 * Runs {@code held} in a transaction left open until {@code racer} is blocked by it, then commits it and
	 * returns what {@code racer} answered.
	 */
	private <T> T whileHeld(Runnable held, Callable<T> racer) throws Exception {
		TransactionTemplate tx = new TransactionTemplate(txManager);
		CompletableFuture<Integer> holderPid = new CompletableFuture<>();
		CountDownLatch mayCommit = new CountDownLatch(1);
		try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
			try {
				Future<?> holder = pool.submit(() -> tx.executeWithoutResult(status -> {
					try {
						held.run();
					}
					catch (RuntimeException | AssertionError heldFailed) {
						holderPid.completeExceptionally(heldFailed);
						throw heldFailed;
					}
					holderPid.complete(jdbc.sql("SELECT pg_backend_pid()").query(Integer.class).single());
					try {
						mayCommit.await(30, TimeUnit.SECONDS);
					}
					catch (InterruptedException interrupted) {
						Thread.currentThread().interrupt();
					}
				}));
				int pid = holderPid.get(10, TimeUnit.SECONDS);
				Future<T> raced = pool.submit(racer);
				Awaitility.await().atMost(Duration.ofSeconds(10)).until(() -> sessionsBlockedBy(pid) >= 1L);
				mayCommit.countDown();
				holder.get(10, TimeUnit.SECONDS);
				return raced.get(10, TimeUnit.SECONDS);
			}
			finally {
				mayCommit.countDown();
			}
		}
	}

	private static GuestContact guest() {
		return new GuestContact("retire-race-" + System.nanoTime() + "@example.com", "Race Guest", "+355691110903");
	}

	private long insertSet(int position) {
		return jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:venue, 'A', :pos, 'STANDARD', 'ONLINE', 4500, 'EUR', :pos, 1)
				RETURNING id
				""").param("venue", venueId).param("pos", position).query(Long.class).single();
	}

	/** A booking from last season, so the remove takes the retire branch, not the delete. */
	private void insertFinishedBooking(long set) {
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) VALUES (:e, 'Past Guest', '+355600') "
						+ "RETURNING id")
				.param("e", "retire-race-past-" + System.nanoTime() + "@example.com").query(Long.class).single();
		jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, amount_minor, amount_currency,
				                     status)
				VALUES (:code, :venue, :set, :cust, :day, 4500, 'EUR', 'COMPLETED')
				""")
				.param("code", "RRACE" + System.nanoTime()).param("venue", venueId).param("set", set)
				.param("cust", customer).param("day", LocalDate.now(TIRANE).minusDays(300)).update();
	}

	private long pendingRequests() {
		return jdbc.sql("SELECT COUNT(*) FROM booking WHERE venue_id = :v AND status = 'PENDING_REQUEST'")
				.param("v", venueId).query(Long.class).single();
	}

	private long sessionsBlockedBy(int pid) {
		return jdbc.sql("SELECT COUNT(*) FROM pg_stat_activity WHERE :pid = ANY (pg_blocking_pids(pid))")
				.param("pid", pid).query(Long.class).single();
	}
}
