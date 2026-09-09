package ai.riviera.platform.availability;

import java.time.LocalDate;
import java.time.OffsetDateTime;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.OwnershipFixtures;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.availability.application.MarkOutcome;
import ai.riviera.platform.availability.application.StaffAvailability;
import ai.riviera.platform.availability.vocabulary.ClaimOutcome;
import ai.riviera.platform.operator.api.OperatorDirectory;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.SetId;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Both claim paths refuse a retired set with {@code NO_SUCH_SET} and write no hold (ADR-0019): the
 * online claim through {@link AvailabilityClaim} and the pool-agnostic staff mark through
 * {@link StaffAvailability}. Real Postgres via Testcontainers; the set sits on a venue of its own
 * (the seed venue's set count is asserted elsewhere) and is retired directly in SQL, since retiring
 * through the console is {@code venue}'s path and this test is about what {@code availability} does
 * with the result.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class RetiredSetClaimIT {

	private static final LocalDate DAY = LocalDate.of(2031, 7, 14);

	@Autowired
	AvailabilityClaim claim;

	@Autowired
	StaffAvailability staff;

	@Autowired
	OperatorDirectory operators;

	@Autowired
	JdbcClient jdbc;

	private SetId retiredSetOnANewVenue(String venueName) {
		long venue = jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES (:name, 'Ksamil', 'Riviera', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""").param("name", venueName).query(Long.class).single();
		OwnershipFixtures.grantToBootstrap(jdbc, venue);
		long id = jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool,
				                          price_minor, price_currency, grid_x, grid_y, retired_at)
				VALUES (:venue, 'Row A', 1, 'STANDARD', 'ONLINE', 2500, 'EUR', 1, 1, :retiredAt)
				RETURNING id
				""")
				.param("venue", venue)
				.param("retiredAt", OffsetDateTime.parse("2026-09-08T10:00:00Z"))
				.query(Long.class).single();
		return new SetId(id);
	}

	private int holdsOn(SetId set) {
		return jdbc.sql("SELECT COUNT(*) FROM set_availability WHERE set_id = :id")
				.param("id", set.value()).query(Integer.class).single();
	}

	@Test
	void theOnlineClaimRefusesARetiredSet() {
		SetId retired = retiredSetOnANewVenue("Retired Online Club");

		assertEquals(ClaimOutcome.NO_SUCH_SET, claim.claim(retired, DAY));
		assertEquals(0, holdsOn(retired), "a refused claim writes no hold");
	}

	@Test
	void theStaffMarkRefusesARetiredSet() {
		SetId retired = retiredSetOnANewVenue("Retired Walk-in Club");
		OperatorId bootstrap = operators.operatorFor("operator").orElseThrow();

		assertEquals(MarkOutcome.NO_SUCH_SET, staff.mark(bootstrap, retired, DAY));
		assertEquals(0, holdsOn(retired), "a refused mark writes no hold");
	}
}
