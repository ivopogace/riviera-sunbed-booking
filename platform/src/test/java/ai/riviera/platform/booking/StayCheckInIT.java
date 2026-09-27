package ai.riviera.platform.booking;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.support.TransactionTemplate;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.StayFixtures.Venue;
import ai.riviera.platform.booking.application.checkin.CheckInBooking;
import ai.riviera.platform.booking.application.checkin.CheckInResult;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Check-in with a stay's code (design D6): on a move day the guest is checked into <em>today's</em>
 * stretch's set and only that day's row is stamped; a second scan is "already checked in today"; a
 * stay with no stretch covering today answers the stay's first day as the wrong service date. The
 * fixture venue's owner scans (invariant #13). Real Postgres via Testcontainers.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "booking.no-show.enabled=false")
class StayCheckInIT {

	@Autowired
	CheckInBooking checkIn;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	TransactionTemplate tx;

	private final List<Long> venues = new ArrayList<>();

	@AfterEach
	void removeFixtures() {
		venues.forEach(venue -> StayFixtures.cleanup(jdbc, venue));
	}

	private OperatorId ownerOf(long venue) {
		return new OperatorId(jdbc.sql("SELECT operator_id FROM operator_venue WHERE venue_id = :v").param("v", venue)
				.query(Long.class).single());
	}

	/** A confirmed stay inserted as stored: the stay row, then one CONFIRMED booking per stretch (the trigger writes the days). */
	private String insertConfirmedStay(Venue venue, LocalDate first, int daysOnA, int daysOnB) {
		String code = "STAY" + System.nanoTime() % 1_000_000;
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		LocalDate switchDay = first.plusDays(daysOnA);
		LocalDate last = switchDay.plusDays(daysOnB - 1L);
		long stay = jdbc.sql("INSERT INTO stay (code, venue_id, first_date, last_date) VALUES (:c, :v, :f, :l) RETURNING id")
				.param("c", code).param("v", venue.id()).param("f", first).param("l", last).query(Long.class).single();
		insertStretch(code + "-1", venue, venue.online().get(0), customer, first, switchDay.minusDays(1), stay);
		insertStretch(code + "-2", venue, venue.online().get(1), customer, switchDay, last, stay);
		return code;
	}

	private void insertStretch(String rowCode, Venue venue, SetId set, long customer, LocalDate first, LocalDate last,
			long stay) {
		jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, last_date, amount_minor,
				                     amount_currency, status, confirmed_at, stay_id)
				VALUES (:code, :venue, :set, :cust, :first, :last, 4500, 'EUR', 'CONFIRMED', now(), :stay)
				""").param("code", rowCode).param("venue", venue.id()).param("set", set.value()).param("cust", customer)
				.param("first", first).param("last", last).param("stay", stay).update();
	}

	@Test
	void aMoveDayChecksTheGuestIntoTodaysStretch() {
		Venue venue = StayFixtures.venue(jdbc, "INSTANT", null, true);
		venues.add(venue.id());
		OperatorId operator = ownerOf(venue.id());
		LocalDate today = LocalDate.now(StayFixtures.TIRANE);
		String code = insertConfirmedStay(venue, today.minusDays(3), 3, 3);

		CheckInResult result = checkIn.checkIn(operator, new VenueId(venue.id()), code);

		CheckInResult.CheckedIn checkedIn = assertInstanceOf(CheckInResult.CheckedIn.class, result);
		assertEquals(venue.online().get(1), checkedIn.setId(), "today's stretch is the second one");
		assertEquals(today, checkedIn.bookingDate());
		assertEquals(1L, jdbc.sql("SELECT count(*) FROM booking_day d JOIN booking b ON b.id = d.booking_id "
						+ "WHERE b.venue_id = :v AND d.attended_at IS NOT NULL").param("v", venue.id())
				.query(Long.class).single(), "only today's day row is stamped");
		assertEquals(new CheckInResult.AlreadyCheckedIn(today, venue.online().get(1)),
				checkIn.checkIn(operator, new VenueId(venue.id()), code),
				"a second scan today still names today's set, so staff can point the guest to it");
	}

	@Test
	void aStayThatHasNotStartedIsTheWrongServiceDate() {
		Venue venue = StayFixtures.venue(jdbc, "INSTANT", null, true);
		venues.add(venue.id());
		OperatorId operator = ownerOf(venue.id());
		LocalDate first = LocalDate.now(StayFixtures.TIRANE).plusDays(5);
		String code = insertConfirmedStay(venue, first, 2, 2);

		CheckInResult result = checkIn.checkIn(operator, new VenueId(venue.id()), code);

		assertEquals(new CheckInResult.WrongServiceDate(first), result);
	}

	@Test
	void aStretchsRowCodeIsNoCredential() {
		Venue venue = StayFixtures.venue(jdbc, "INSTANT", null, true);
		venues.add(venue.id());
		String code = insertConfirmedStay(venue, LocalDate.now(StayFixtures.TIRANE).minusDays(3), 3, 3);

		assertInstanceOf(CheckInResult.NotFound.class, checkIn.checkIn(ownerOf(venue.id()), new VenueId(venue.id()), code + "-2"));
	}

	@Test
	void checkInOnOneStretchNeverWaitsOnASiblingStretchsRow() throws Exception {
		Venue venue = StayFixtures.venue(jdbc, "INSTANT", null, true);
		venues.add(venue.id());
		OperatorId operator = ownerOf(venue.id());
		String code = insertConfirmedStay(venue, LocalDate.now(StayFixtures.TIRANE).minusDays(3), 3, 3);
		long firstStretch = jdbc.sql("SELECT id FROM booking WHERE venue_id = :v ORDER BY booking_date LIMIT 1")
				.param("v", venue.id()).query(Long.class).single();
		CountDownLatch rowLocked = new CountDownLatch(1);
		CountDownLatch rowReleased = new CountDownLatch(1);

		CheckInResult result;
		try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
			Future<?> holder = pool.submit(() -> tx.executeWithoutResult(status -> {
				jdbc.sql("SELECT id FROM booking WHERE id = :id FOR UPDATE").param("id", firstStretch).query(Long.class).single();
				rowLocked.countDown();
				try {
					rowReleased.await();
				}
				catch (InterruptedException interrupted) {
					Thread.currentThread().interrupt();
				}
			}));
			assertTrue(rowLocked.await(10, TimeUnit.SECONDS));
			try {
				result = pool.submit(() -> checkIn.checkIn(operator, new VenueId(venue.id()), code)).get(10, TimeUnit.SECONDS);
			}
			finally {
				rowReleased.countDown();
				holder.get(10, TimeUnit.SECONDS);
			}
		}

		assertEquals(venue.online().get(1), assertInstanceOf(CheckInResult.CheckedIn.class, result).setId(),
				"today's stretch checks in while yesterday's stretch row is locked elsewhere");
	}
}
