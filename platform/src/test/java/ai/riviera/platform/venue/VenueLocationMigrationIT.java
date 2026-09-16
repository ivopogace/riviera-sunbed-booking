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
 * Verifies Flyway V58: the venue's two nullable decimal-degree columns and the CHECK that keeps the
 * pair whole (both present or both absent) and each coordinate in range. Runs only when Docker is
 * available (Testcontainers Postgres), against the full Flyway chain incl. the seed.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class VenueLocationMigrationIT {

	private static final long MIRAMAR = 1L; // first seeded venue (identity PK)
	private static final String CONSTRAINT = "venue_location_check";

	@Autowired
	JdbcTemplate jdbc;

	@AfterEach
	void unpinMiramar() {
		jdbc.update("UPDATE venue SET latitude = NULL, longitude = NULL WHERE id = ?", MIRAMAR);
	}

	@Test
	void existingVenuesCarryNoLocation() {
		Integer pinned = jdbc.queryForObject(
				"SELECT COUNT(*) FROM venue WHERE latitude IS NOT NULL OR longitude IS NOT NULL", Integer.class);
		assertThat(pinned).isZero();
	}

	@Test
	void aWholePairInRangeIsAcceptedAndReadsBackAtSixDecimals() {
		jdbc.update("UPDATE venue SET latitude = 40.1468, longitude = 19.6482 WHERE id = ?", MIRAMAR);
		assertThat(jdbc.queryForObject("SELECT latitude::text FROM venue WHERE id = ?", String.class, MIRAMAR))
				.isEqualTo("40.146800");
		assertThat(jdbc.queryForObject("SELECT longitude::text FROM venue WHERE id = ?", String.class, MIRAMAR))
				.isEqualTo("19.648200");
	}

	@Test
	void theBoundsThemselvesAreAccepted() {
		jdbc.update("UPDATE venue SET latitude = -90, longitude = -180 WHERE id = ?", MIRAMAR);
		jdbc.update("UPDATE venue SET latitude = 90, longitude = 180 WHERE id = ?", MIRAMAR);
	}

	@Test
	void checkRefusesAHalfPresentPair() {
		DataIntegrityViolationException lonMissing = assertThrows(DataIntegrityViolationException.class,
				() -> jdbc.update("UPDATE venue SET latitude = 40.1468 WHERE id = ?", MIRAMAR));
		assertThat(lonMissing.getMessage()).contains(CONSTRAINT);
		DataIntegrityViolationException latMissing = assertThrows(DataIntegrityViolationException.class,
				() -> jdbc.update("UPDATE venue SET longitude = 19.6482 WHERE id = ?", MIRAMAR));
		assertThat(latMissing.getMessage()).contains(CONSTRAINT);
	}

	@Test
	void checkRefusesALatitudeOutOfRange() {
		DataIntegrityViolationException rejected = assertThrows(DataIntegrityViolationException.class,
				() -> jdbc.update("UPDATE venue SET latitude = 90.000001, longitude = 19.6482 WHERE id = ?",
						MIRAMAR));
		assertThat(rejected.getMessage()).contains(CONSTRAINT);
	}

	@Test
	void checkRefusesALongitudeOutOfRange() {
		DataIntegrityViolationException rejected = assertThrows(DataIntegrityViolationException.class,
				() -> jdbc.update("UPDATE venue SET latitude = 40.1468, longitude = -180.000001 WHERE id = ?",
						MIRAMAR));
		assertThat(rejected.getMessage()).contains(CONSTRAINT);
	}
}
