package ai.riviera.platform.availability;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.availability.api.ClaimOutcome;
import ai.riviera.platform.availability.application.MarkOutcome;
import ai.riviera.platform.availability.application.ReleaseOutcome;
import ai.riviera.platform.availability.application.StaffAvailability;
import ai.riviera.platform.operator.api.OperatorDirectory;
import ai.riviera.platform.operator.api.OperatorId;
import ai.riviera.platform.venue.api.SetId;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Verifies the U8 staff mark/release outcomes (issue #10, AC-2..AC-7) against the seeded Miramar
 * map. Marking a free set succeeds and blocks an online claim, marking a taken set is rejected,
 * release frees only a staff mark (never an online row), a past date is rejected, and an unknown
 * set is rejected. Each test uses a distinct far-future {@code booking_date} so methods are
 * independent of one another and of the other availability ITs sharing the Testcontainers context.
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
	OperatorDirectory operators;

	/** The interim bootstrap operator (owns every venue, incl. Miramar) — resolves the guard (#73). */
	private OperatorId bootstrap() {
		return operators.operatorFor("operator").orElseThrow();
	}

	private SetId anyOnlineSet() {
		return new SetId(jdbc.sql("SELECT id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1")
				.query(Long.class).single());
	}

	private SetId anyWalkInSet() {
		return new SetId(jdbc.sql("SELECT id FROM set_position WHERE pool = 'WALK_IN' ORDER BY id LIMIT 1")
				.query(Long.class).single());
	}

	private String stateOf(SetId set, LocalDate date) {
		return jdbc.sql("SELECT state FROM set_availability WHERE set_id = :id AND booking_date = :date")
				.param("id", set.value()).param("date", date)
				.query(String.class).optional().orElse("FREE");
	}

	@Test
	void markingFreeSetSucceeds() {
		SetId set = anyWalkInSet();
		LocalDate date = LocalDate.of(2030, 7, 1);

		assertEquals(MarkOutcome.MARKED, staff.mark(bootstrap(), set, date));
		assertEquals("STAFF_MARKED", stateOf(set, date));
	}

	@Test
	void markingOnlinePoolSetSucceeds() {
		// Pool-agnostic by decision (issue #10): an ONLINE-pool set can be staff-marked — the
		// collision-relevant case (marking removes it from the online pool).
		SetId set = anyOnlineSet();
		LocalDate date = LocalDate.of(2030, 7, 2);

		assertEquals(MarkOutcome.MARKED, staff.mark(bootstrap(), set, date));
		assertEquals("STAFF_MARKED", stateOf(set, date));
	}

	@Test
	void markingTakenSetIsRejected() {
		SetId set = anyWalkInSet();
		LocalDate date = LocalDate.of(2030, 7, 3);

		assertEquals(MarkOutcome.MARKED, staff.mark(bootstrap(), set, date));
		assertEquals(MarkOutcome.ALREADY_TAKEN, staff.mark(bootstrap(), set, date), "re-mark must lose");
	}

	@Test
	void staffMarkBlocksOnlineClaim() {
		// AC-6: once staff-marked, a tourist cannot claim the same (set, date) online.
		SetId set = anyOnlineSet();
		LocalDate date = LocalDate.of(2030, 7, 4);

		assertEquals(MarkOutcome.MARKED, staff.mark(bootstrap(), set, date));
		assertEquals(ClaimOutcome.ALREADY_TAKEN, claim.claim(set, date));
		assertEquals("STAFF_MARKED", stateOf(set, date), "the online claim must not overwrite the staff mark");
	}

	@Test
	void releasingStaffMarkedSetFreesIt() {
		SetId set = anyWalkInSet();
		LocalDate date = LocalDate.of(2030, 7, 5);
		assertEquals(MarkOutcome.MARKED, staff.mark(bootstrap(), set, date));

		assertEquals(ReleaseOutcome.RELEASED, staff.release(bootstrap(), set, date));
		assertEquals("FREE", stateOf(set, date), "release must delete the STAFF_MARKED row");
	}

	@Test
	void releaseNeverDeletesOnlineRow() {
		// AC-5 (the guard): a staff release must never free an online booking's row.
		SetId set = anyOnlineSet();
		LocalDate date = LocalDate.of(2030, 7, 6);
		assertEquals(ClaimOutcome.CLAIMED, claim.claim(set, date));

		assertEquals(ReleaseOutcome.NOT_MARKED, staff.release(bootstrap(), set, date), "online row is not staff-marked");
		assertEquals("BOOKED_ONLINE", stateOf(set, date), "the online row must remain intact");
	}

	@Test
	void releaseWhenNothingMarkedIsNoOp() {
		SetId set = anyWalkInSet();
		LocalDate date = LocalDate.of(2030, 7, 7);

		assertEquals(ReleaseOutcome.NOT_MARKED, staff.release(bootstrap(), set, date));
		assertEquals("FREE", stateOf(set, date));
	}

	@Test
	void markingPastDateIsRejected() {
		// AC-7: a date before today in Europe/Tirane is rejected and writes no row (invariant #4/#6).
		SetId set = anyWalkInSet();
		LocalDate past = LocalDate.of(2020, 1, 1);

		assertEquals(MarkOutcome.DATE_IN_PAST, staff.mark(bootstrap(), set, past));
		assertEquals("FREE", stateOf(set, past), "a rejected past-date mark must create no row");
	}

	@Test
	void markingUnknownSetIsRejected() {
		SetId set = new SetId(999_999L);
		LocalDate date = LocalDate.of(2030, 7, 8);

		assertEquals(MarkOutcome.NO_SUCH_SET, staff.mark(bootstrap(), set, date));
	}
}
