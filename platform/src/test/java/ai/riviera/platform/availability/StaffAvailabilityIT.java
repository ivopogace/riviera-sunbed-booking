package ai.riviera.platform.availability;

import java.time.Clock;
import java.time.LocalDate;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.TiraneDaytimeClock;
import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.availability.vocabulary.ClaimOutcome;
import ai.riviera.platform.availability.application.MarkOutcome;
import ai.riviera.platform.availability.application.ReleaseOutcome;
import ai.riviera.platform.availability.application.StaffAvailability;
import ai.riviera.platform.booking.StayFixtures;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * The staff mark/release outcomes (AC-2..AC-7): marking a free set succeeds and blocks an online claim,
 * marking a taken set is rejected, release frees only a staff mark (never an online row), a past date
 * is rejected, and an unknown set is rejected. Each test runs on a venue of its own, on a day read from
 * the context clock.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class StaffAvailabilityIT {

	@Autowired
	StaffAvailability staff;

	@Autowired
	AvailabilityClaim claim;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	Clock clock;

	private StayFixtures.Venue fixture;
	private VenueId venue;
	private OperatorId owner;

	@BeforeEach
	void seedVenue() {
		fixture = StayFixtures.venue(jdbc, "INSTANT", null, true);
		venue = new VenueId(fixture.id());
		owner = StayFixtures.ownerOf(jdbc, fixture);
	}

	@AfterEach
	void removeVenue() {
		StayFixtures.cleanupNow(jdbc, fixture.id());
	}

	private SetId anyOnlineSet() {
		return fixture.online().getFirst();
	}

	private SetId anyWalkInSet() {
		return fixture.walkIn();
	}

	/** A day the staff mark accepts whatever the hour: not before today in Europe/Tirane (#6). */
	private LocalDate aDayAhead() {
		return TiraneDaytimeClock.today(clock).plusDays(30);
	}

	private String stateOf(SetId set, LocalDate date) {
		return jdbc.sql("SELECT state FROM set_availability WHERE set_id = :id AND booking_date = :date")
				.param("id", set.value()).param("date", date)
				.query(String.class).optional().orElse("FREE");
	}

	@Test
	void markingFreeSetSucceeds() {
		SetId set = anyWalkInSet();
		LocalDate date = aDayAhead();

		assertEquals(MarkOutcome.MARKED, staff.mark(owner, venue, set, date));
		assertEquals("STAFF_MARKED", stateOf(set, date));
	}

	@Test
	void markingOnlinePoolSetSucceeds() {
		// Pool-agnostic by decision: an ONLINE-pool set can be staff-marked — the
		// collision-relevant case (marking removes it from the online pool).
		SetId set = anyOnlineSet();
		LocalDate date = aDayAhead();

		assertEquals(MarkOutcome.MARKED, staff.mark(owner, venue, set, date));
		assertEquals("STAFF_MARKED", stateOf(set, date));
	}

	@Test
	void markingTakenSetIsRejected() {
		SetId set = anyWalkInSet();
		LocalDate date = aDayAhead();

		assertEquals(MarkOutcome.MARKED, staff.mark(owner, venue, set, date));
		assertEquals(MarkOutcome.ALREADY_TAKEN, staff.mark(owner, venue, set, date), "re-mark must lose");
	}

	@Test
	void staffMarkBlocksOnlineClaim() {
		// AC-6: once staff-marked, a tourist cannot claim the same (set, date) online.
		SetId set = anyOnlineSet();
		LocalDate date = aDayAhead();

		assertEquals(MarkOutcome.MARKED, staff.mark(owner, venue, set, date));
		assertEquals(ClaimOutcome.ALREADY_TAKEN, claim.claim(set, date));
		assertEquals("STAFF_MARKED", stateOf(set, date), "the online claim must not overwrite the staff mark");
	}

	@Test
	void releasingStaffMarkedSetFreesIt() {
		SetId set = anyWalkInSet();
		LocalDate date = aDayAhead();
		assertEquals(MarkOutcome.MARKED, staff.mark(owner, venue, set, date));

		assertEquals(ReleaseOutcome.RELEASED, staff.release(owner, venue, set, date));
		assertEquals("FREE", stateOf(set, date), "release must delete the STAFF_MARKED row");
	}

	@Test
	void releaseNeverDeletesOnlineRow() {
		// AC-5 (the guard): a staff release must never free an online booking's row.
		SetId set = anyOnlineSet();
		LocalDate date = aDayAhead();
		assertEquals(ClaimOutcome.CLAIMED, claim.claim(set, date));

		assertEquals(ReleaseOutcome.NOT_MARKED, staff.release(owner, venue, set, date), "online row is not staff-marked");
		assertEquals("BOOKED_ONLINE", stateOf(set, date), "the online row must remain intact");
	}

	@Test
	void releaseWhenNothingMarkedIsNoOp() {
		SetId set = anyWalkInSet();
		LocalDate date = aDayAhead();

		assertEquals(ReleaseOutcome.NOT_MARKED, staff.release(owner, venue, set, date));
		assertEquals("FREE", stateOf(set, date));
	}

	@Test
	void markingPastDateIsRejected() {
		// AC-7: a date before today in Europe/Tirane is rejected and writes no row (invariant #4/#6).
		SetId set = anyWalkInSet();
		LocalDate past = LocalDate.of(2020, 1, 1);

		assertEquals(MarkOutcome.DATE_IN_PAST, staff.mark(owner, venue, set, past));
		assertEquals("FREE", stateOf(set, past), "a rejected past-date mark must create no row");
	}

	@Test
	void markingUnknownSetIsRejected() {
		SetId set = new SetId(999_999L);
		LocalDate date = aDayAhead();

		assertEquals(MarkOutcome.NO_SUCH_SET, staff.mark(owner, venue, set, date));
	}
}
