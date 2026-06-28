package ai.riviera.platform.availability;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;

import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Verifies the U2 migration (issue #5) enforces invariant #2 <em>in the database</em>
 * (invariant #12 — constraints that enforce invariants are tested): the
 * {@code UNIQUE(set_id, booking_date)} double-booking guard and the {@code state} CHECK.
 * Testcontainers Postgres + real Flyway, so it runs in CI; skipped where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class AvailabilityMigrationIT {

	@Autowired
	JdbcClient jdbc;

	private long anyOnlineSetId() {
		return jdbc.sql("SELECT id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1")
				.query(Long.class).single();
	}

	private void insert(long setId, LocalDate date, String state) {
		jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) "
						+ "VALUES (:setId, :date, :state)")
				.param("setId", setId).param("date", date).param("state", state)
				.update();
	}

	@Test
	void uniqueConstraintRejectsDuplicateSetDate() {
		long setId = anyOnlineSetId();
		LocalDate date = LocalDate.of(2026, 9, 1);
		insert(setId, date, "BOOKED_ONLINE");

		assertThrows(DataIntegrityViolationException.class,
				() -> insert(setId, date, "BOOKED_ONLINE"),
				"UNIQUE(set_id, booking_date) must reject a second row for the same (set, date) "
						+ "— invariant #2, the double-booking guard.");
	}

	@Test
	void checkConstraintRejectsUnknownState() {
		long setId = anyOnlineSetId();
		LocalDate date = LocalDate.of(2026, 9, 2);

		assertThrows(DataIntegrityViolationException.class,
				() -> insert(setId, date, "FREE"),
				"state CHECK admits only the 'taken' tokens (FREE = absence of a row).");
	}
}
