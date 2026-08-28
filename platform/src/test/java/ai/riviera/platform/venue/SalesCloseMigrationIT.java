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
 * Verifies Flyway V44 (#791, epic #790): the per-venue sales-close column, its default backfill,
 * and the three-value CHECK. Runs only when Docker is available (Testcontainers Postgres),
 * against the full Flyway chain incl. the seed.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class SalesCloseMigrationIT {

	private static final long MIRAMAR = 1L; // first seeded venue (identity PK)

	@Autowired
	JdbcTemplate jdbc;

	@Test
	void backfillsExistingVenuesTo1600() {
		String salesClose = jdbc.queryForObject(
				"SELECT sales_close::text FROM venue WHERE id = ?", String.class, MIRAMAR);
		assertThat(salesClose).isEqualTo("16:00:00");
	}

	@Test
	void checkRejectsAnyOtherTime() {
		DataIntegrityViolationException rejected = assertThrows(DataIntegrityViolationException.class,
				() -> jdbc.update("UPDATE venue SET sales_close = TIME '12:00' WHERE id = ?", MIRAMAR));
		assertThat(rejected.getMessage()).contains("venue_sales_close_check");
	}
}
