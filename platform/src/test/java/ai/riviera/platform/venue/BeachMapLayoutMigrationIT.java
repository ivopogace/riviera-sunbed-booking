package ai.riviera.platform.venue;

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
 * Verifies the U7 layout-integrity constraints (Flyway V12, issue #7): the beach-map editor
 * is a write surface, so a venue's set positions must not collide on a grid cell and must use
 * positive coordinates. The read-only U1 seed never collided; an operator dragging sets onto a
 * grid can. These constraints (invariant #12) are the layout analogue of invariant #2's
 * "DB constraint is the concurrency primitive" — created AND tested by the migration. Runs only
 * when Docker is available (Testcontainers Postgres), against the full Flyway chain incl. the seed.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class BeachMapLayoutMigrationIT {

	private static final long MIRAMAR = 1L; // first seeded venue (identity PK)

	@Autowired
	JdbcTemplate jdbc;

	private void insertSet(long venueId, int positionNo, int gridX, int gridY) {
		// A distinct row_label per call keeps the (venue, row_label, position_no) constraint out of
		// the way so each test isolates the grid/coordinate constraint it targets.
		String rowLabel = "T-" + gridX + "-" + gridY + "-" + positionNo;
		jdbc.update("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool,
				                          price_minor, price_currency, grid_x, grid_y)
				VALUES (?, ?, ?, 'STANDARD', 'ONLINE', 2500, 'EUR', ?, ?)
				""", venueId, rowLabel, positionNo, gridX, gridY);
	}

	@Test
	void seedStillLoadsAfterV12() {
		// R-4: V12 must not break the existing Miramar seed — all 24 sets remain, each at a
		// distinct (grid_x, grid_y) with coordinates >= 1.
		Integer sets = jdbc.queryForObject(
				"SELECT count(*) FROM set_position WHERE venue_id = ?", Integer.class, MIRAMAR);
		assertThat(sets).isEqualTo(24);

		Integer distinctCells = jdbc.queryForObject(
				"SELECT count(DISTINCT (grid_x, grid_y)) FROM set_position WHERE venue_id = ?",
				Integer.class, MIRAMAR);
		assertThat(distinctCells).isEqualTo(24);
	}

	@Test
	void gridCellUniquePerVenue() {
		// AC-5: two sets cannot occupy one (venue_id, grid_x, grid_y) cell. Miramar already has a
		// set at (1,1); inserting another there must be rejected by set_position_grid_uniq.
		DataIntegrityViolationException rejected = assertThrows(DataIntegrityViolationException.class,
				() -> insertSet(MIRAMAR, 99, 1, 1));
		assertThat(rejected.getMessage()).contains("set_position_grid_uniq");
	}

	@Test
	void rejectsNonPositiveGridX() {
		DataIntegrityViolationException rejected = assertThrows(DataIntegrityViolationException.class,
				() -> insertSet(MIRAMAR, 98, 0, 3));
		assertThat(rejected).isNotNull(); // set_position_grid_x_check
	}

	@Test
	void rejectsNonPositiveGridY() {
		DataIntegrityViolationException rejected = assertThrows(DataIntegrityViolationException.class,
				() -> insertSet(MIRAMAR, 97, 3, 0));
		assertThat(rejected).isNotNull(); // set_position_grid_y_check
	}

	@Test
	void rejectsNonPositivePositionNo() {
		DataIntegrityViolationException rejected = assertThrows(DataIntegrityViolationException.class,
				() -> insertSet(MIRAMAR, 0, 5, 4));
		assertThat(rejected).isNotNull(); // set_position_no_check
	}
}
