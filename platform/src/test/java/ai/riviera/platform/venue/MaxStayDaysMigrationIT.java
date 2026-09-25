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
 * Verifies Flyway V63: the nullable per-venue maximum stay and its {@code >= 1} CHECK. Runs only
 * when Docker is available (Testcontainers Postgres), against the full Flyway chain incl. the seed.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class MaxStayDaysMigrationIT {

	private static final long MIRAMAR = 1L; // first seeded venue (identity PK)

	@Autowired
	JdbcTemplate jdbc;

	@Test
	void existingVenuesHaveNoMaximum() {
		Integer max = jdbc.queryForObject("SELECT max_stay_days FROM venue WHERE id = ?", Integer.class, MIRAMAR);
		assertThat(max).isNull();
	}

	@Test
	void zeroIsRefusedNullAndOneAreAccepted() {
		DataIntegrityViolationException rejected = assertThrows(DataIntegrityViolationException.class,
				() -> jdbc.update("UPDATE venue SET max_stay_days = 0 WHERE id = ?", MIRAMAR));
		assertThat(rejected.getMessage()).contains("venue_max_stay_days_check");

		jdbc.update("UPDATE venue SET max_stay_days = 1 WHERE id = ?", MIRAMAR);
		assertThat(jdbc.queryForObject("SELECT max_stay_days FROM venue WHERE id = ?", Integer.class, MIRAMAR))
				.isEqualTo(1);
		jdbc.update("UPDATE venue SET max_stay_days = NULL WHERE id = ?", MIRAMAR);
		assertThat(jdbc.queryForObject("SELECT max_stay_days FROM venue WHERE id = ?", Integer.class, MIRAMAR))
				.isNull();
	}
}
