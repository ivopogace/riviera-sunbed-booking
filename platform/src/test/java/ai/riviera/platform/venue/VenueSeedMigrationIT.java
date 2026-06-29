package ai.riviera.platform.venue;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies the U1 schema + demo seed (Flyway V2/V3, issue #4): the {@code venue} and
 * {@code set_position} tables exist and the Miramar Beach Club demo fixture loaded with
 * the design's 4×6 map. Runs only when Docker is available (Testcontainers Postgres) —
 * the Postgres-specific DDL (BIGINT identity, TIMESTAMPTZ, CHECK constraints) is validated
 * against a real Postgres, not an emulation.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class VenueSeedMigrationIT {

	@Autowired
	JdbcTemplate jdbc;

	@Test
	void seedsMiramarVenueWithBothPools() {
		Integer venues = jdbc.queryForObject(
				"SELECT count(*) FROM venue WHERE name = 'Miramar Beach Club'", Integer.class);
		assertThat(venues).isEqualTo(1);

		Integer sets = jdbc.queryForObject(
				"SELECT count(*) FROM set_position sp JOIN venue v ON v.id = sp.venue_id "
						+ "WHERE v.name = 'Miramar Beach Club'", Integer.class);
		assertThat(sets).isEqualTo(24);

		Integer distinctPools = jdbc.queryForObject(
				"SELECT count(DISTINCT pool) FROM set_position", Integer.class);
		assertThat(distinctPools).isEqualTo(2); // ONLINE and WALK_IN both present (AC-1)

		Long fromPrice = jdbc.queryForObject(
				"SELECT min(price_minor) FROM set_position sp JOIN venue v ON v.id = sp.venue_id "
						+ "WHERE v.name = 'Miramar Beach Club'", Long.class);
		assertThat(fromPrice).isEqualTo(2500L); // "from €25/set"
	}

	@Test
	void dropsTheSeedAvailabilityPlaceholder() {
		// Issue #44 / V6: the render-only placeholder column is gone — availability is now
		// sourced per-(set, date) from set_availability, never from this dead column.
		Integer column = jdbc.queryForObject(
				"SELECT count(*) FROM information_schema.columns "
						+ "WHERE table_name = 'set_position' AND column_name = 'seed_availability'",
				Integer.class);
		assertThat(column).isZero();
	}

	@Test
	void enforcesOneSetPerGridCell() {
		// invariant #12: the layout UNIQUE(venue_id, row_label, position_no) constraint exists.
		Integer duplicateCells = jdbc.queryForObject(
				"SELECT count(*) FROM (SELECT venue_id, row_label, position_no "
						+ "FROM set_position GROUP BY venue_id, row_label, position_no "
						+ "HAVING count(*) > 1) dupes", Integer.class);
		assertThat(duplicateCells).isZero();
	}
}
