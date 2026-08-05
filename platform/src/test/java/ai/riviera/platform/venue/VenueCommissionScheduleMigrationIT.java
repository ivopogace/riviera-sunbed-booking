package ai.riviera.platform.venue;

import java.time.LocalDate;

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
 * The A7 commission-rate schedule's storage constraints (Flyway V39, epic #348) — the DB-level
 * backstop behind {@code VenueFieldValidation.requireCommissionBps} (invariant #12).
 *
 * <p><strong>The backfill is the load-bearing assertion.</strong> The per-service-date read is
 * "the latest schedule row at or before that date"; if a venue had no row covering a past date the
 * read would fall through and answer the <em>current</em> rate, which is precisely the
 * past-days-re-split defect this slice exists to fix. So the migration must leave the schedule
 * <em>total</em> — every venue covered from the epoch floor onward — and this test pins it against
 * the full Flyway chain, including the venues V3's demo seed inserts.
 *
 * <p>Runs only when Docker is available (Testcontainers Postgres).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class VenueCommissionScheduleMigrationIT {

	/** The floor the backfill writes — must predate every service date a booking could carry. */
	private static final LocalDate EPOCH_FLOOR = LocalDate.of(1970, 1, 1);

	@Autowired
	JdbcTemplate jdbc;

	private long newVenue(int commissionBps) {
		return jdbc.queryForObject("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES ('A7 schedule test', 'Test beach', 'Test region', 'INSTANT', ?, 'EUR')
				RETURNING id
				""", Long.class, commissionBps);
	}

	@Test
	void backfillsEveryVenueAtTheEpochFloor() {
		Integer venuesWithoutAFloorRow = jdbc.queryForObject("""
				SELECT COUNT(*) FROM venue v
				 WHERE NOT EXISTS (SELECT 1 FROM venue_commission_rate r
				                    WHERE r.venue_id = v.id AND r.effective_from = ?)
				""", Integer.class, EPOCH_FLOOR);

		assertThat(venuesWithoutAFloorRow)
				.as("the schedule must be total: no venue may be left without an epoch-floor row, "
						+ "or the per-date read falls through to the live rate for a past day")
				.isZero();
	}

	@Test
	void theBackfilledRowCarriesTheVenuesOwnRate() {
		Integer mismatched = jdbc.queryForObject("""
				SELECT COUNT(*) FROM venue v
				 JOIN venue_commission_rate r ON r.venue_id = v.id AND r.effective_from = ?
				 WHERE r.commission_bps <> v.commission_bps
				""", Integer.class, EPOCH_FLOOR);

		assertThat(mismatched)
				.as("no venue's rate has ever changed, so its floor row is its current rate")
				.isZero();
	}

	@Test
	void rejectsAnOutOfRangeRate() {
		long venueId = newVenue(1500);

		DataIntegrityViolationException tooHigh = assertThrows(DataIntegrityViolationException.class,
				() -> insertSchedule(venueId, LocalDate.of(2026, 8, 6), 10_001));
		assertThat(tooHigh.getMessage()).contains("venue_commission_rate_bps_check");
		assertThrows(DataIntegrityViolationException.class,
				() -> insertSchedule(venueId, LocalDate.of(2026, 8, 7), -1));
	}

	@Test
	void holdsOneRatePerVenueAndEffectiveDate() {
		long venueId = newVenue(1500);
		LocalDate effectiveFrom = LocalDate.of(2026, 8, 6);
		insertSchedule(venueId, effectiveFrom, 2000);

		assertThrows(DataIntegrityViolationException.class,
				() -> insertSchedule(venueId, effectiveFrom, 2500));
	}

	@Test
	void anUnknownVenueCannotBeScheduled() {
		assertThrows(DataIntegrityViolationException.class,
				() -> insertSchedule(-1L, LocalDate.of(2026, 8, 6), 2000));
	}

	private void insertSchedule(long venueId, LocalDate effectiveFrom, int commissionBps) {
		jdbc.update("""
				INSERT INTO venue_commission_rate (venue_id, effective_from, commission_bps)
				VALUES (?, ?, ?)
				""", venueId, effectiveFrom, commissionBps);
	}
}
