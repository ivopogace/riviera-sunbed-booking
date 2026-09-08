package ai.riviera.platform.venue;

import java.time.OffsetDateTime;

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
 * Verifies V50 (ADR-0019): the nullable {@code retired_at} marker, the {@code active_set_position}
 * view that hides a retired row, and the layout-uniqueness rules rewritten over active rows only —
 * a retired set's slot is reusable, two active sets still cannot share one. Created AND tested by
 * the migration (invariant #12). Runs only when Docker is available (Testcontainers Postgres).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class SetRetireMigrationIT {

	@Autowired
	JdbcTemplate jdbc;

	private long newVenue(String name) {
		return jdbc.queryForObject("""
				INSERT INTO venue (name, beach, region, description, booking_mode,
				                   commission_bps, payout_currency, booking_cutoff)
				VALUES (?, 'Ksamil', 'Riviera', 'retire migration', 'INSTANT', 1500, 'EUR', TIME '18:00')
				RETURNING id
				""", Long.class, name);
	}

	private long insertSet(long venueId, String rowLabel, int positionNo, int gridX, int gridY) {
		return jdbc.queryForObject("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool,
				                          price_minor, price_currency, grid_x, grid_y)
				VALUES (?, ?, ?, 'STANDARD', 'ONLINE', 2500, 'EUR', ?, ?)
				RETURNING id
				""", Long.class, venueId, rowLabel, positionNo, gridX, gridY);
	}

	private void retire(long setId) {
		jdbc.update("UPDATE set_position SET retired_at = ? WHERE id = ?",
				OffsetDateTime.parse("2026-09-08T10:00:00Z"), setId);
	}

	@Test
	void retiredAtIsANullableInstant() {
		String type = jdbc.queryForObject("""
				SELECT data_type FROM information_schema.columns
				WHERE table_name = 'set_position' AND column_name = 'retired_at'
				""", String.class);
		assertThat(type).isEqualTo("timestamp with time zone");
		String nullable = jdbc.queryForObject("""
				SELECT is_nullable FROM information_schema.columns
				WHERE table_name = 'set_position' AND column_name = 'retired_at'
				""", String.class);
		assertThat(nullable).isEqualTo("YES");
	}

	@Test
	void theActiveViewHidesARetiredSet() {
		long venue = newVenue("View Club");
		long active = insertSet(venue, "Row A", 1, 1, 1);
		long retired = insertSet(venue, "Row A", 2, 2, 1);
		retire(retired);

		assertThat(jdbc.queryForList("SELECT id FROM active_set_position WHERE venue_id = ?", Long.class, venue))
				.containsExactly(active);
		assertThat(jdbc.queryForList("SELECT id FROM set_position WHERE venue_id = ? ORDER BY id", Long.class, venue))
				.containsExactly(active, retired);
	}

	@Test
	void aRetiredSetsSlotIsReusable() {
		long venue = newVenue("Reuse Club");
		long retired = insertSet(venue, "Row A", 1, 1, 1);
		retire(retired);

		long replacement = insertSet(venue, "Row A", 1, 1, 1);

		assertThat(replacement).isNotEqualTo(retired);
		assertThat(jdbc.queryForList("SELECT id FROM active_set_position WHERE venue_id = ?", Long.class, venue))
				.containsExactly(replacement);
	}

	@Test
	void activeSetsStillCannotShareACell() {
		long venue = newVenue("Cell Club");
		insertSet(venue, "Row A", 1, 1, 1);

		DataIntegrityViolationException sameCell = assertThrows(DataIntegrityViolationException.class,
				() -> insertSet(venue, "Row B", 1, 1, 1));
		assertThat(sameCell.getMessage()).contains("set_position_grid_uniq");

		DataIntegrityViolationException samePosition = assertThrows(DataIntegrityViolationException.class,
				() -> insertSet(venue, "Row A", 1, 2, 1));
		assertThat(samePosition.getMessage()).contains("set_position_cell_uniq");
	}
}
