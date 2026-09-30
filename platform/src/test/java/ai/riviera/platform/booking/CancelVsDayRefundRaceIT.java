package ai.riviera.platform.booking;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
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
import ai.riviera.platform.booking.vocabulary.PreviewToken;
import ai.riviera.platform.booking.vocabulary.RefundConfirmation;
import ai.riviera.platform.booking.vocabulary.RemodelClaim;
import ai.riviera.platform.booking.vocabulary.RemodelCommit;
import ai.riviera.platform.booking.vocabulary.RemodelOutcome;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static ai.riviera.platform.booking.StayFixtures.PRICE;
import static ai.riviera.platform.booking.StayFixtures.firstDay;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * A whole-booking cancel that starts while a day refund holds the booking row lock (#1281): each cancel
 * leg quotes from a read taken after that lock, so the day refunded under it is never refunded again
 * and no booking gives back more than it collected (#9, #10). Real Postgres; the day refund's
 * transaction is held open until the cancel is seen waiting on a lock.
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

	/**
	 * Runs {@code cancel} while {@code day} of {@code bookingId} is refunded in a transaction that holds the
	 * booking row lock, commits the refund once {@code cancel} waits on a lock, and answers {@code cancel}'s result.
	 */
	private <T> T whileADayRefundHoldsTheLock(long bookingId, LocalDate day, long refundMinor, Callable<T> cancel)
			throws Exception {
		CountDownLatch refunded = new CountDownLatch(1);
		CountDownLatch refundCommits = new CountDownLatch(1);
		try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
			Future<?> refund = pool.submit(() -> tx.executeWithoutResult(status -> {
				bookings.refundDay(bookingId, day, refundMinor, Instant.now(), DayRefundStamp.weather()).orElseThrow();
				refunded.countDown();
				try {
					refundCommits.await();
				}
				catch (InterruptedException interrupted) {
					Thread.currentThread().interrupt();
				}
			}));
			assertTrue(refunded.await(10, TimeUnit.SECONDS), "the day refund took the booking lock");
			Future<T> cancelled = pool.submit(cancel);
			Awaitility.await().atMost(Duration.ofSeconds(10)).until(() -> sessionsWaitingOnALock() >= 1L);
			refundCommits.countDown();
			refund.get(10, TimeUnit.SECONDS);
			return cancelled.get(10, TimeUnit.SECONDS);
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

	private long sessionsWaitingOnALock() {
		return jdbc.sql("SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database()")
				.query(Long.class).single();
	}
}
