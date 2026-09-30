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
import ai.riviera.platform.venue.application.CloseForSeason;
import ai.riviera.platform.venue.application.CloseOutcome;
import ai.riviera.platform.venue.vocabulary.SeasonClosure;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

/**
 * A season closure and a reserve for one venue serialize on its row (#1304): the closure waits for a reserve
 * in flight and counts its booking, a reserve waits for a closure in flight and is refused. Each race holds
 * one side's transaction open until the other is seen blocked by it ({@code pg_blocking_pids}).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {"booking.no-show.enabled=false", "booking.awaiting-payment.initial-delay=PT2H"})
class SeasonClosureVsReserveRaceIT {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	@Autowired
	ReserveSetService reserveSet;

	@Autowired
	ReserveStayService reserveStay;

	@Autowired
	CloseForSeason seasons;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	PlatformTransactionManager txManager;

	private final LocalDate day = LocalDate.now(TIRANE).plusDays(30);
	private final SeasonClosure closure = SeasonClosure.closed(LocalDate.now(TIRANE).plusDays(60), false);
	private long venueId;
	private long operatorId;
	private long setA;
	private long setB;
	private OperatorId owner;

	@BeforeEach
	void seedVenue() {
		venueId = jdbc.sql("""
				INSERT INTO venue (name, beach, booking_mode, commission_bps, payout_currency)
				VALUES (:name, 'KSAMIL', 'INSTANT', 1500, 'EUR') RETURNING id
				""").param("name", "Closure Race " + System.nanoTime()).query(Long.class).single();
		operatorId = jdbc.sql("INSERT INTO operator (username, status) VALUES (:u, 'ACTIVE') RETURNING id")
				.param("u", "closure-race-" + System.nanoTime()).query(Long.class).single();
		jdbc.sql("INSERT INTO operator_venue (venue_id, operator_id) VALUES (:v, :o)")
				.param("v", venueId).param("o", operatorId).update();
		owner = new OperatorId(operatorId);
		setA = insertSet(1);
		setB = insertSet(2);
	}

	@AfterEach
	void removeVenue() {
		jdbc.sql("DELETE FROM booking WHERE venue_id = :v").param("v", venueId).update();
		jdbc.sql("DELETE FROM stay WHERE venue_id = :v").param("v", venueId).update();
		jdbc.sql("DELETE FROM set_availability WHERE set_id IN (:s)").param("s", List.of(setA, setB)).update();
		jdbc.sql("DELETE FROM set_position WHERE venue_id = :v").param("v", venueId).update();
		jdbc.sql("DELETE FROM operator_venue WHERE venue_id = :v").param("v", venueId).update();
		jdbc.sql("DELETE FROM operator WHERE id = :o").param("o", operatorId).update();
		jdbc.sql("DELETE FROM venue WHERE id = :v").param("v", venueId).update();
		jdbc.sql("DELETE FROM customer WHERE email LIKE 'closure-race-%'").update();
	}

	@Test
	void aClosureWaitsForAnInFlightReserveAndCountsIt() throws Exception {
		CloseOutcome closed = whileHeld(
				() -> assertInstanceOf(ReserveOutcome.Reserved.class, reserveSet.reserve(command(setA))),
				() -> seasons.close(owner, new VenueId(venueId), closure));

		assertEquals(1, assertInstanceOf(CloseOutcome.Closed.class, closed).counts().futureBookings(),
				"the closure answered after the reserve committed, so the guest it owes is counted");
	}

	@Test
	void aReserveWaitsForAnInFlightClosureAndIsRefused() throws Exception {
		ReserveOutcome reserved = whileHeld(
				() -> assertInstanceOf(CloseOutcome.Closed.class, seasons.close(owner, new VenueId(venueId), closure)),
				() -> reserveSet.reserve(command(setA)));

		assertEquals(new ReserveOutcome.Rejected(BookingOutcome.Rejected.VENUE_CLOSED), reserved,
				"the reserve read its fence after the closure committed");
		assertEquals(0L, held(), "and claimed nothing");
	}

	@Test
	void aStayReserveWaitsForAnInFlightClosureAndIsRefused() throws Exception {
		CreateStayCommand stay = new CreateStayCommand(List.of(
				new CreateStayCommand.Stretch(new SetId(setA), day, day),
				new CreateStayCommand.Stretch(new SetId(setB), day.plusDays(1), day.plusDays(1))), guest(), null);

		StayReserveOutcome reserved = whileHeld(
				() -> assertInstanceOf(CloseOutcome.Closed.class, seasons.close(owner, new VenueId(venueId), closure)),
				() -> reserveStay.reserve(stay));

		assertEquals(new StayReserveOutcome.Rejected(BookingOutcome.Rejected.VENUE_CLOSED), reserved);
		assertEquals(0L, held());
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

	private CreateBookingCommand command(long set) {
		return new CreateBookingCommand(new SetId(set), day, day, guest(), null);
	}

	private static GuestContact guest() {
		return new GuestContact("closure-race-" + System.nanoTime() + "@example.com", "Race Guest", "+355691110902");
	}

	private long insertSet(int position) {
		return jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:venue, 'A', :pos, 'STANDARD', 'ONLINE', 4500, 'EUR', :pos, 1)
				RETURNING id
				""").param("venue", venueId).param("pos", position).query(Long.class).single();
	}

	private long held() {
		return jdbc.sql("SELECT COUNT(*) FROM set_availability WHERE set_id IN (:s)")
				.param("s", List.of(setA, setB)).query(Long.class).single();
	}

	private long sessionsBlockedBy(int pid) {
		return jdbc.sql("SELECT COUNT(*) FROM pg_stat_activity WHERE :pid = ANY (pg_blocking_pids(pid))")
				.param("pid", pid).query(Long.class).single();
	}
}
