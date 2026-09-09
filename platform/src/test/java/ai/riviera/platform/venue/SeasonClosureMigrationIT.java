package ai.riviera.platform.venue;

import org.junit.jupiter.api.AfterEach;
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
 * Verifies Flyway V51: the season-closure columns, the opt-in's default, and the CHECK that keeps
 * an open venue bare and the opt-in tied to a reopen date. Runs only when Docker is available
 * (Testcontainers Postgres), against the full Flyway chain incl. the seed.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class SeasonClosureMigrationIT {

	private static final long MIRAMAR = 1L; // first seeded venue (identity PK)

	@Autowired
	JdbcTemplate jdbc;

	@AfterEach
	void reopenMiramar() {
		jdbc.update("UPDATE venue SET closed_at = NULL, reopen_on = NULL, advance_sales = FALSE WHERE id = ?",
				MIRAMAR);
	}

	@Test
	void existingVenuesReadOpenWithTheOptInOff() {
		Boolean advanceSales = jdbc.queryForObject(
				"SELECT advance_sales FROM venue WHERE id = ?", Boolean.class, MIRAMAR);
		Integer closed = jdbc.queryForObject(
				"SELECT COUNT(*) FROM venue WHERE closed_at IS NOT NULL OR reopen_on IS NOT NULL", Integer.class);
		assertThat(advanceSales).isFalse();
		assertThat(closed).isZero();
	}

	@Test
	void aClosureWithOrWithoutAReopenDateIsAccepted() {
		jdbc.update("UPDATE venue SET closed_at = now(), reopen_on = DATE '2027-05-15', advance_sales = TRUE WHERE id = ?",
				MIRAMAR);
		jdbc.update("UPDATE venue SET closed_at = now(), reopen_on = NULL, advance_sales = FALSE WHERE id = ?",
				MIRAMAR);
	}

	@Test
	void checkRefusesAReopenDateOrTheOptInOnAnOpenVenue() {
		DataIntegrityViolationException date = assertThrows(DataIntegrityViolationException.class,
				() -> jdbc.update("UPDATE venue SET reopen_on = DATE '2027-05-15' WHERE id = ?", MIRAMAR));
		assertThat(date.getMessage()).contains("venue_season_closure_check");
		DataIntegrityViolationException optIn = assertThrows(DataIntegrityViolationException.class,
				() -> jdbc.update("UPDATE venue SET advance_sales = TRUE WHERE id = ?", MIRAMAR));
		assertThat(optIn.getMessage()).contains("venue_season_closure_check");
	}

	@Test
	void checkRefusesTheOptInWithoutAReopenDate() {
		DataIntegrityViolationException rejected = assertThrows(DataIntegrityViolationException.class,
				() -> jdbc.update("UPDATE venue SET closed_at = now(), advance_sales = TRUE WHERE id = ?", MIRAMAR));
		assertThat(rejected.getMessage()).contains("venue_season_closure_check");
	}
}
