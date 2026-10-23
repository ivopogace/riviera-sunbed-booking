package ai.riviera.platform.venue;

import java.util.List;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.FlywayException;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * V78 against a database that stopped at V77: a live set past row 26 refuses it, recording nothing;
 * then the seed's authored row names and rows carrying each other's letters become their grid
 * letters, retired sets (one past row 26) keep theirs, and the new CHECK refuses a live set past row
 * 26 while admitting a retired one. Its own Spring context (the Flyway target) gives it its own
 * container, so the pre-V78 shape is real rather than assumed.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "spring.flyway.target=77")
class RowLabelGridLetterMigrationIT {

	@Autowired
	JdbcClient jdbc;

	@Autowired
	Flyway flyway;

	@Test
	void everyActiveSetTakesItsGridLetterAndARetiredSetKeepsItsLabel() {
		long swapped = jdbc.sql("""
				INSERT INTO venue (name, beach, booking_mode, commission_bps, payout_currency)
				VALUES ('Swapped Rows Club', 'KSAMIL', 'INSTANT', 1500, 'EUR') RETURNING id
				""").query(Long.class).single();
		jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool,
				                          price_minor, price_currency, grid_x, grid_y, retired_at)
				VALUES (:v, 'B', 1, 'PREMIUM', 'ONLINE', 3500, 'EUR', 1, 1, NULL),
				       (:v, 'A', 1, 'STANDARD', 'ONLINE', 3000, 'EUR', 1, 2, NULL),
				       (:v, 'Last', 1, 'STANDARD', 'ONLINE', 3000, 'EUR', 1, 26, NULL),
				       (:v, 'Old front row', 1, 'PREMIUM', 'ONLINE', 3500, 'EUR', 1, 1, now()),
				       (:v, 'Old far row', 1, 'STANDARD', 'ONLINE', 3000, 'EUR', 1, 40, now())
				""").param("v", swapped).update();

		long pastZ = jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool,
				                          price_minor, price_currency, grid_x, grid_y)
				VALUES (:v, 'Far', 1, 'STANDARD', 'ONLINE', 3000, 'EUR', 1, 27) RETURNING id
				""").param("v", swapped).query(Long.class).single();
		Flyway latest = Flyway.configure().configuration(flyway.getConfiguration())
				.target(MigrationVersion.LATEST).load();

		FlywayException refused = assertThrows(FlywayException.class, latest::migrate,
				"a live set past row Z has no letter: V78 refuses");
		assertTrue(refused.getMessage().contains("set_position_grid_y_lettered_check"), refused.getMessage());
		assertEquals(0L, jdbc.sql("SELECT COUNT(*) FROM flyway_schema_history WHERE version = '78'")
				.query(Long.class).single(), "the refused run leaves no V78 row behind, failed or not");
		jdbc.sql("DELETE FROM set_position WHERE id = :id").param("id", pastZ).update();
		latest.migrate();

		assertEquals(0L, jdbc.sql("""
				SELECT COUNT(*) FROM set_position WHERE retired_at IS NULL AND row_label <> chr(64 + grid_y)
				""").query(Long.class).single(), "every live set carries its grid row's letter");
		assertEquals(List.of("A:6", "B:6", "C:6", "D:6"), jdbc.sql("""
				SELECT sp.row_label || ':' || COUNT(*) FROM set_position sp JOIN venue v ON v.id = sp.venue_id
				WHERE v.name = 'Miramar Beach Club' AND sp.retired_at IS NULL
				GROUP BY sp.row_label ORDER BY sp.row_label
				""").query(String.class).list(), "the seed's Front row · Sea view … Row 4 · Back read A to D");
		assertEquals(List.of("A", "B", "Z", "Old front row", "Old far row"), jdbc.sql("""
				SELECT row_label FROM set_position WHERE venue_id = :v ORDER BY retired_at IS NOT NULL, grid_y
				""").param("v", swapped).query(String.class).list(), "swapped rows untangle, row 26 is Z; history, past row 26 too, stays");

		String pastZOn = """
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool,
				                          price_minor, price_currency, grid_x, grid_y, retired_at)
				VALUES (:v, '[', 2, 'STANDARD', 'ONLINE', 3000, 'EUR', 2, 27, %s)
				""";
		DataIntegrityViolationException live = assertThrows(DataIntegrityViolationException.class,
				() -> jdbc.sql(pastZOn.formatted("NULL")).param("v", swapped).update());
		assertTrue(live.getMessage().contains("set_position_grid_y_lettered_check"), live.getMessage());
		assertEquals(1, jdbc.sql(pastZOn.formatted("now()")).param("v", swapped).update(),
				"a retired set is exempt");
	}
}
