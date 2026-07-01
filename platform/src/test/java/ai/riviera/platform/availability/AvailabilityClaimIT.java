package ai.riviera.platform.availability;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.availability.vocabulary.ClaimOutcome;
import ai.riviera.platform.venue.vocabulary.SetId;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Verifies the U2 claim outcomes (issue #5, AC-2..AC-5) against the seeded Miramar map:
 * a free online set is claimable once, a re-claim is rejected, a walk-in set is not
 * claimable online (invariant #3), and an unknown set is rejected. Each test uses a
 * distinct {@code booking_date} so methods are independent of one another and of the
 * concurrency IT (the Testcontainers Postgres / Spring context is shared).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class AvailabilityClaimIT {

	@Autowired
	AvailabilityClaim claim;

	@Autowired
	JdbcClient jdbc;

	private SetId anyOnlineSet() {
		return new SetId(jdbc.sql("SELECT id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1")
				.query(Long.class).single());
	}

	private SetId anyWalkInSet() {
		return new SetId(jdbc.sql("SELECT id FROM set_position WHERE pool = 'WALK_IN' ORDER BY id LIMIT 1")
				.query(Long.class).single());
	}

	private long rowCount(SetId setId, LocalDate date) {
		return jdbc.sql("SELECT count(*) FROM set_availability WHERE set_id = :id AND booking_date = :date")
				.param("id", setId.value()).param("date", date)
				.query(Long.class).single();
	}

	@Test
	void claimingFreeOnlineSetSucceeds() {
		SetId set = anyOnlineSet();
		LocalDate date = LocalDate.of(2026, 7, 1);

		assertEquals(ClaimOutcome.CLAIMED, claim.claim(set, date));
		assertEquals(1L, rowCount(set, date), "exactly one BOOKED_ONLINE row should exist");
	}

	@Test
	void claimingTakenSetIsRejected() {
		SetId set = anyOnlineSet();
		LocalDate date = LocalDate.of(2026, 7, 2);

		assertEquals(ClaimOutcome.CLAIMED, claim.claim(set, date));
		assertEquals(ClaimOutcome.ALREADY_TAKEN, claim.claim(set, date), "re-claim must lose");
		assertEquals(1L, rowCount(set, date), "the rejected re-claim must not create a second row");
	}

	@Test
	void walkInSetIsNotClaimable() {
		SetId set = anyWalkInSet();
		LocalDate date = LocalDate.of(2026, 7, 3);

		assertEquals(ClaimOutcome.NOT_ONLINE_POOL, claim.claim(set, date), "invariant #3");
		assertEquals(0L, rowCount(set, date), "a non-claimable set must create no row");
	}

	@Test
	void unknownSetIsRejected() {
		SetId set = new SetId(999_999L);
		LocalDate date = LocalDate.of(2026, 7, 4);

		assertEquals(ClaimOutcome.NO_SUCH_SET, claim.claim(set, date));
		assertEquals(0L, rowCount(set, date));
	}
}
