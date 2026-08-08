package ai.riviera.platform.venue;

import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * The commission-rate schedule's storage constraints (Flyway V39) — the DB-level
 * backstop behind {@code VenueFieldValidation.requireCommissionBps} and the two idempotency guards
 * the rate write rides (invariant #12).
 *
 * <p><strong>What this deliberately does not assert.</strong> An earlier version of this test claimed
 * the migration left every venue with a schedule row, and CI caught it: the shared Testcontainers
 * database accumulates venues from every other IT, most of them inserted with raw SQL. That was not a
 * bad assertion so much as evidence of a bad design — coverage that depended on every insert path
 * cooperating. Coverage now comes from the <em>write</em> (a rate change pins the rate it supersedes),
 * which needs no cooperation from whoever created the venue, and is pinned by
 * {@code JdbcVenueCommissionScheduleIT}. What is left here is what a migration can actually guarantee
 * about a table other tests share: its constraints.
 *
 * <p>Runs only when Docker is available (Testcontainers Postgres).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class VenueCommissionScheduleMigrationIT {

	private static final LocalDate EFFECTIVE_FROM = LocalDate.of(2026, 8, 6);

	@Autowired
	JdbcTemplate jdbc;

	private long newVenue() {
		return jdbc.queryForObject("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES ('A7 schedule test', 'Test beach', 'Test region', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""", Long.class);
	}

	@Test
	void rejectsAnOutOfRangeRate() {
		long venueId = newVenue();

		DataIntegrityViolationException tooHigh = assertThrows(DataIntegrityViolationException.class,
				() -> insertSchedule(venueId, EFFECTIVE_FROM, 10_001));
		assertThat(tooHigh.getMessage()).contains("venue_commission_rate_bps_check");
		assertThrows(DataIntegrityViolationException.class,
				() -> insertSchedule(venueId, EFFECTIVE_FROM.plusDays(1), -1));
	}

	@Test
	void acceptsBothEndsOfTheRange() {
		long venueId = newVenue();

		insertSchedule(venueId, EFFECTIVE_FROM, 0);
		insertSchedule(venueId, EFFECTIVE_FROM.plusDays(1), 10_000);

		assertThat(scheduledRates(venueId)).containsExactly(0, 10_000);
	}

	@Test
	void holdsOneRatePerVenueAndEffectiveDate() {
		long venueId = newVenue();
		insertSchedule(venueId, EFFECTIVE_FROM, 2000);

		assertThrows(DataIntegrityViolationException.class,
				() -> insertSchedule(venueId, EFFECTIVE_FROM, 2500));
	}

	@Test
	void anUnknownVenueCannotBeScheduled() {
		assertThrows(DataIntegrityViolationException.class,
				() -> insertSchedule(-1L, EFFECTIVE_FROM, 2000));
	}

	@Test
	void aDeletedVenueTakesItsScheduleWithIt() {
		long venueId = newVenue();
		insertSchedule(venueId, EFFECTIVE_FROM, 2000);

		jdbc.update("DELETE FROM venue WHERE id = ?", venueId);

		assertThat(scheduledRates(venueId))
				.as("the schedule is venue configuration, cascaded like venue_amenity — not an audit "
						+ "ledger; the auditable record of a commission is payout_ledger_entry, which "
						+ "deliberately has no cascade")
				.isEmpty();
	}

	private void insertSchedule(long venueId, LocalDate effectiveFrom, int commissionBps) {
		jdbc.update("""
				INSERT INTO venue_commission_rate (venue_id, effective_from, commission_bps)
				VALUES (?, ?, ?)
				""", venueId, effectiveFrom, commissionBps);
	}

	private List<Integer> scheduledRates(long venueId) {
		return jdbc.queryForList("""
				SELECT commission_bps FROM venue_commission_rate
				 WHERE venue_id = ? ORDER BY effective_from
				""", Integer.class, venueId);
	}
}
