package ai.riviera.platform.booking;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
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
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.support.TransactionTemplate;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.StayFixtures.SeededStay;
import ai.riviera.platform.booking.StayFixtures.Venue;
import ai.riviera.platform.booking.api.RemodelClaims;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.application.cancel.CancelBooking;
import ai.riviera.platform.booking.application.cancel.CancelOutcome;
import ai.riviera.platform.booking.application.refund.DayRefundStamp;
import ai.riviera.platform.booking.application.refund.RefundVenueDay;
import ai.riviera.platform.booking.application.refund.VenueDayRefundOutcome;
import ai.riviera.platform.booking.vocabulary.PreviewToken;
import ai.riviera.platform.booking.vocabulary.RefundConfirmation;
import ai.riviera.platform.booking.vocabulary.RemodelClaim;
import ai.riviera.platform.booking.vocabulary.RemodelCommit;
import ai.riviera.platform.booking.vocabulary.RemodelOutcome;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static ai.riviera.platform.booking.StayFixtures.PRICE;
import static ai.riviera.platform.booking.StayFixtures.firstDay;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

/**
 * A whole-booking cancel or a remodel move that starts while a day refund holds the booking row lock (#1281):
 * each reads the booking after that lock, so the day refunded under it is never refunded again, no booking
 * gives back more than it collected (#9, #10), a remodel refund left nothing ends as nothing left (#1300), and a
 * day the venue released stays free (#2). Real Postgres;
 * the day refund's transaction is held open until the other side is seen blocked by it.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "booking.no-show.enabled=false")
class CancelVsDayRefundRaceIT {

	private static final int DAYS = 3;

	@Autowired
	CancelBooking cancelBooking;

	@Autowired
	RemodelClaims remodelClaims;

	@Autowired
	Bookings bookings;

	@Autowired
	RefundVenueDay refundVenueDay;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	TransactionTemplate tx;

	private final List<Long> venues = new ArrayList<>();

	@AfterEach
	void removeFixtures() {
		venues.forEach(venue -> StayFixtures.cleanup(jdbc, venue));
	}

	@Test
	void aLoneCancelWaitingOnADayRefundRefundsTheRemainder() throws Exception {
		Venue venue = venue();
		LocalDate first = firstDay();
		String code = "RACELONE" + System.nanoTime() % 1_000_000;
		long id = insertLone(venue, code, venue.online().getFirst(), first);
		accrue(venue, id, DAYS * PRICE);

		CancelOutcome outcome = whileADayRefundHoldsTheLock(id, first.plusDays(1), PRICE,
				() -> cancelBooking.cancel(code));

		assertEquals(new CancelOutcome.Cancelled((DAYS - 1) * PRICE, "EUR", CancelOutcome.Tier.FULL), outcome,
				"the cancel quotes what remains after the day refunded under its lock");
		assertEquals((DAYS - 1) * PRICE, cancelRefundOf(id));
		assertEquals(DAYS * PRICE, refundedTotalOf(id), "never more refunded than collected");
		assertEquals((DAYS - 1) * PRICE, reversedGrossOf(id), "the venue is debited only for what the guest gets back (#9)");
	}

	@Test
	void aStayCancelWaitingOnADayRefundRefundsTheRemainder() throws Exception {
		Venue venue = venue();
		LocalDate first = firstDay();
		SeededStay stay = StayFixtures.insertStay(jdbc, venue, "RACESTAY" + System.nanoTime() % 1_000_000, first,
				venue.online().get(0), 3, "CONFIRMED", venue.online().get(1), 4, "CONFIRMED");
		stay.stretches().forEach(stretch -> accrue(venue, stretch, PRICE));
		long second = stay.stretches().get(1);
		long dayShare = PRICE / 4;

		CancelOutcome outcome = whileADayRefundHoldsTheLock(second, first.plusDays(4), dayShare,
				() -> cancelBooking.cancel(stay.code()));

		assertEquals(new CancelOutcome.Cancelled(2 * PRICE - dayShare, "EUR", CancelOutcome.Tier.FULL), outcome,
				"each stretch is quoted over its remainder, not refused as changed under its lock");
		assertEquals(PRICE - dayShare, cancelRefundOf(second));
		assertEquals(PRICE, refundedTotalOf(second), "never more refunded than collected");
		assertEquals(PRICE - dayShare, reversedGrossOf(second), "the venue is debited only for what the guest gets back (#9)");
	}

	@Test
	void aRemodelRefundWaitingOnADayRefundRefundsTheRemainder() throws Exception {
		Venue venue = venue();
		LocalDate first = firstDay();
		SetId disturbed = venue.online().getFirst();
		long id = insertLone(venue, "RACEREMO" + System.nanoTime() % 1_000_000, disturbed, first);
		accrue(venue, id, DAYS * PRICE);
		for (SetId other : venue.online().subList(1, venue.online().size())) {
			first.datesUntil(first.plusDays(DAYS)).forEach(day -> StayFixtures.take(jdbc, other, day));
		}
		VenueId venueId = new VenueId(venue.id());
		List<RemodelClaim> claims = remodelClaims.classify(StayFixtures.ownerOf(jdbc, venue), venueId, List.of(disturbed));
		assertEquals(RemodelOutcome.Refund.REFUND, claims.getFirst().outcome(), "no free set to move to");

		RemodelCommit outcome = whileADayRefundHoldsTheLock(id, first.plusDays(1), PRICE,
				() -> remodelClaims.commit(StayFixtures.ownerOf(jdbc, venue), venueId, List.of(disturbed),
						PreviewToken.of(claims), new RefundConfirmation(1, "Re-laying row A")));

		assertInstanceOf(RemodelCommit.Applied.class, outcome);
		assertEquals((DAYS - 1) * PRICE, cancelRefundOf(id), "the remodel refunds what remains, not the amount");
		assertEquals(DAYS * PRICE, refundedTotalOf(id), "never more refunded than collected");
		assertEquals((DAYS - 1) * PRICE, reversedGrossOf(id), "the venue is debited only for what the guest gets back (#9)");
	}

	@Test
	void aRemodelRefundWaitingOnTheLastDayRefundSettlesAsNothingLeft() throws Exception {
		Venue venue = venue();
		LocalDate first = firstDay();
		SetId disturbed = venue.online().getFirst();
		long id = insertLone(venue, "RACENONE" + System.nanoTime() % 1_000_000, disturbed, first);
		accrue(venue, id, DAYS * PRICE);
		for (int day = 0; day < DAYS - 1; day++) {
			bookings.refundDay(id, first.plusDays(day), PRICE, Instant.now(), DayRefundStamp.weather()).orElseThrow();
		}
		for (SetId other : venue.online().subList(1, venue.online().size())) {
			first.datesUntil(first.plusDays(DAYS)).forEach(day -> StayFixtures.take(jdbc, other, day));
		}
		OperatorId owner = StayFixtures.ownerOf(jdbc, venue);
		VenueId venueId = new VenueId(venue.id());
		List<RemodelClaim> claims = remodelClaims.classify(owner, venueId, List.of(disturbed));
		assertEquals(RemodelOutcome.Refund.REFUND, claims.getFirst().outcome(), "one day is still the guest's");

		RemodelCommit outcome = whileADayRefundHoldsTheLock(id, first.plusDays(DAYS - 1L), PRICE,
				() -> remodelClaims.commit(owner, venueId, List.of(disturbed), PreviewToken.of(claims),
						new RefundConfirmation(1, "Re-laying row A")));

		assertEquals(RemodelOutcome.NothingLeft.NOTHING_LEFT, assertInstanceOf(RemodelCommit.Applied.class, outcome)
				.settled().getFirst().outcome(), "the leg decides on what it finds under the lock");
		assertEquals(0L, cancelRefundOf(id), "no €0 VENUE_CHANGE refund: nothing was left");
		assertEquals(DAYS * PRICE, refundedTotalOf(id), "never more refunded than collected");
		assertEquals(List.of("NOTHING_LEFT:0:0"), jdbc.sql("""
				SELECT kind || ':' || amount_minor || ':' || fee_minor FROM remodel_receipt_outcome WHERE booking_id = :b
				""").param("b", id).query(String.class).list());
		assertEquals(List.of(), heldOn(disturbed), "every weather-refunded day it still held is freed (#2)");
		assertEquals(0L, jdbc.sql("""
				SELECT count(*) FROM (SELECT event_type, serialized_event FROM event_publication
				                      UNION ALL SELECT event_type, serialized_event FROM event_publication_archive) p
				WHERE p.event_type LIKE '%.BookingCancelled' AND p.serialized_event::jsonb -> 'bookingId' ->> 'value' = :id
				""").param("id", String.valueOf(id)).query(Long.class).single(), "no BookingCancelled, so no reversal or fee");
	}

	@Test
	void aRemodelMoveWaitingOnTheLastDayRefundSettlesAsNothingLeftAndTakesNoCandidate() throws Exception {
		Venue venue = venue();
		LocalDate first = firstDay();
		SetId from = venue.online().get(0);
		SetId to = venue.online().get(1);
		long id = insertLone(venue, "RACEMVNL" + System.nanoTime() % 1_000_000, from, first);
		accrue(venue, id, DAYS * PRICE);
		for (int day = 0; day < DAYS - 1; day++) {
			bookings.refundDay(id, first.plusDays(day), PRICE, Instant.now(), DayRefundStamp.weather()).orElseThrow();
		}
		first.datesUntil(first.plusDays(DAYS)).forEach(day -> StayFixtures.take(jdbc, venue.online().get(2), day));
		OperatorId owner = StayFixtures.ownerOf(jdbc, venue);
		VenueId venueId = new VenueId(venue.id());
		List<RemodelClaim> claims = remodelClaims.classify(owner, venueId, List.of(from));
		assertEquals(to, assertInstanceOf(RemodelOutcome.Move.class, claims.getFirst().outcome()).to().setId());

		RemodelCommit outcome = whileADayRefundHoldsTheLock(id, first.plusDays(DAYS - 1L), PRICE,
				() -> remodelClaims.commit(owner, venueId, List.of(from), PreviewToken.of(claims), RefundConfirmation.NONE));

		assertEquals(RemodelOutcome.NothingLeft.NOTHING_LEFT, assertInstanceOf(RemodelCommit.Applied.class, outcome)
				.settled().getFirst().outcome(), "the move leg decides on what it finds under the lock");
		assertEquals(List.of(), heldOn(to), "a booking with nothing left never takes the candidate");
		assertEquals(List.of(), heldOn(from), "every day it still held is freed (#2)");
		assertEquals(from.value(), jdbc.sql("SELECT set_id FROM booking WHERE id = :id").param("id", id)
				.query(Long.class).single(), "not re-seated");
		assertEquals(0L, cancelRefundOf(id));
	}

	@Test
	void aRemodelMoveWaitingOnAVenueDayRefundLeavesTheReleasedDayFree() throws Exception {
		Venue venue = venue();
		LocalDate first = firstDay();
		LocalDate refunded = first.plusDays(1);
		SetId from = venue.online().get(0);
		SetId to = venue.online().get(1);
		String code = "RACEMOVE" + System.nanoTime() % 1_000_000;
		accrue(venue, insertLone(venue, code, from, first), DAYS * PRICE);
		first.datesUntil(first.plusDays(DAYS)).forEach(day -> StayFixtures.take(jdbc, venue.online().get(2), day));
		OperatorId owner = StayFixtures.ownerOf(jdbc, venue);
		VenueId venueId = new VenueId(venue.id());
		List<RemodelClaim> claims = remodelClaims.classify(owner, venueId, List.of(from));
		assertEquals(to, assertInstanceOf(RemodelOutcome.Move.class, claims.getFirst().outcome()).to().setId());

		RemodelCommit outcome = whileHeld(
				() -> assertInstanceOf(VenueDayRefundOutcome.DayRefunded.class,
						refundVenueDay.refundDay(owner, venueId, code, refunded)),
				() -> remodelClaims.commit(owner, venueId, List.of(from), PreviewToken.of(claims), RefundConfirmation.NONE));

		assertInstanceOf(RemodelCommit.Applied.class, outcome);
		assertEquals(List.of(first, first.plusDays(2)), heldOn(to),
				"the move claims only the days the booking still holds: the venue released the refunded one");
		assertEquals(List.of(), heldOn(from), "every day the booking held on the old set is freed");
	}

	private <T> T whileADayRefundHoldsTheLock(long bookingId, LocalDate day, long refundMinor, Callable<T> cancel)
			throws Exception {
		return whileHeld(() -> bookings.refundDay(bookingId, day, refundMinor, Instant.now(), DayRefundStamp.weather())
				.orElseThrow(), cancel);
	}

	/**
	 * Runs {@code cancel} while {@code dayRefund} runs in a transaction that holds the booking row lock, commits the
	 * refund once a session is blocked by that transaction, and answers {@code cancel}'s result.
	 */
	private <T> T whileHeld(Runnable dayRefund, Callable<T> cancel) throws Exception {
		CompletableFuture<Integer> refundPid = new CompletableFuture<>();
		CountDownLatch refundCommits = new CountDownLatch(1);
		try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
			try {
				Future<?> refund = pool.submit(() -> tx.executeWithoutResult(status -> {
					dayRefund.run();
					refundPid.complete(jdbc.sql("SELECT pg_backend_pid()").query(Integer.class).single());
					try {
						refundCommits.await(30, TimeUnit.SECONDS);
					}
					catch (InterruptedException interrupted) {
						Thread.currentThread().interrupt();
					}
				}));
				int pid = refundPid.get(10, TimeUnit.SECONDS);
				Future<T> cancelled = pool.submit(cancel);
				Awaitility.await().atMost(Duration.ofSeconds(10)).until(() -> sessionsBlockedBy(pid) >= 1L);
				refundCommits.countDown();
				refund.get(10, TimeUnit.SECONDS);
				return cancelled.get(10, TimeUnit.SECONDS);
			}
			finally {
				refundCommits.countDown();
			}
		}
	}

	private Venue venue() {
		Venue venue = StayFixtures.venue(jdbc, "INSTANT", null, true);
		venues.add(venue.id());
		return venue;
	}

	/** A lone {@code DAYS}-day {@code CONFIRMED} booking on {@code set}, every day held. */
	private long insertLone(Venue venue, String code, SetId set, LocalDate first) {
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		long id = jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, last_date, amount_minor,
				                     amount_currency, status, confirmed_at)
				VALUES (:code, :venue, :set, :cust, :first, :last, :amount, 'EUR', 'CONFIRMED', now())
				RETURNING id
				""").param("code", code).param("venue", venue.id()).param("set", set.value()).param("cust", customer)
				.param("first", first).param("last", first.plusDays(DAYS - 1L)).param("amount", DAYS * PRICE)
				.query(Long.class).single();
		first.datesUntil(first.plusDays(DAYS)).forEach(day -> StayFixtures.take(jdbc, set, day));
		return id;
	}

	/** The confirmation's accrual, which the cancel's reversal draws against (the fixtures skip the confirm path). */
	private void accrue(Venue venue, long bookingId, long grossMinor) {
		jdbc.sql("""
				INSERT INTO payout_ledger_entry (venue_id, booking_id, entry_type, gross_minor, commission_minor,
				                                 net_minor, currency)
				VALUES (:v, :b, 'ACCRUAL', :gross, 0, :gross, 'EUR')
				""").param("v", venue.id()).param("b", bookingId).param("gross", grossMinor).update();
	}

	/** The gross the payout listener reverses off the cancel, once it has drained. */
	private long reversedGrossOf(long bookingId) {
		Awaitility.await().atMost(Duration.ofSeconds(10)).until(() -> jdbc.sql(
				"SELECT count(*) FROM payout_ledger_entry WHERE booking_id = :b AND entry_type = 'REVERSAL'")
				.param("b", bookingId).query(Long.class).single() == 1L);
		return jdbc.sql("SELECT gross_minor FROM payout_ledger_entry WHERE booking_id = :b AND entry_type = 'REVERSAL'")
				.param("b", bookingId).query(Long.class).single();
	}

	private long cancelRefundOf(long bookingId) {
		return jdbc.sql("SELECT refund_minor FROM booking WHERE id = :id AND status = 'CANCELLED'")
				.param("id", bookingId).query(Long.class).single();
	}

	/** The cancel's refund plus every refunded day's: what the guest gets back in all. */
	private long refundedTotalOf(long bookingId) {
		return jdbc.sql("""
				SELECT COALESCE(b.refund_minor, 0)
				     + (SELECT COALESCE(SUM(d.refund_minor), 0) FROM booking_day d WHERE d.booking_id = b.id)
				FROM booking b WHERE b.id = :id
				""").param("id", bookingId).query(Long.class).single();
	}

	private List<LocalDate> heldOn(SetId set) {
		return jdbc.sql("SELECT booking_date FROM set_availability WHERE set_id = :s ORDER BY booking_date")
				.param("s", set.value()).query(LocalDate.class).list();
	}

	private long sessionsBlockedBy(int pid) {
		return jdbc.sql("SELECT count(*) FROM pg_stat_activity WHERE :pid = ANY (pg_blocking_pids(pid))")
				.param("pid", pid).query(Long.class).single();
	}
}
