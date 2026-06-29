package ai.riviera.platform.payment;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Verifies the V8 migration (issue #8, PR #53) creates the Spring Modulith Event Publication
 * Registry tables that the async {@code @ApplicationModuleListener} path relies on (invariant #12:
 * Flyway owns the schema, not auto-init). ARCHIVE completion mode needs <strong>both</strong> the
 * live {@code event_publication} table and the {@code event_publication_archive} table. Confirms the
 * v2 columns are present (the columns the Modulith 2.1 repository reads). Testcontainers; skipped
 * where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class EventRegistryMigrationIT {

	@Autowired
	JdbcClient jdbc;

	private long columnCount(String table) {
		return jdbc.sql("""
				SELECT COUNT(*) FROM information_schema.columns
				WHERE table_name = :t
				  AND column_name IN ('id','listener_id','event_type','serialized_event',
				      'publication_date','completion_date','status','completion_attempts',
				      'last_resubmission_date')
				""").param("t", table).query(Long.class).single();
	}

	@Test
	void registryTablesExistWithV2Columns() {
		assertEquals(9L, columnCount("event_publication"),
				"event_publication must carry the full v2 column set the Modulith 2.1 repository reads");
		assertEquals(9L, columnCount("event_publication_archive"),
				"ARCHIVE completion mode moves completed publications to event_publication_archive");
	}

	@Test
	void eventPublicationAcceptsARow() {
		// Smoke: the live table is writable with the expected shape (UUID PK, tz timestamps).
		jdbc.sql("""
				INSERT INTO event_publication (id, listener_id, event_type, serialized_event, publication_date)
				VALUES (gen_random_uuid(), 'test.listener', 'test.Event', '{}', NOW())
				""").update();
		long rows = jdbc.sql("SELECT COUNT(*) FROM event_publication WHERE listener_id = 'test.listener'")
				.query(Long.class).single();
		assertEquals(1L, rows);
	}
}
