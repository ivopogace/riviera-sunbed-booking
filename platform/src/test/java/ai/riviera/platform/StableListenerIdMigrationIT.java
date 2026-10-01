package ai.riviera.platform;

import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.simple.JdbcClient;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pins the V74 mapping: every registry listener's pre-#1340 default id ({@code <class>.on(<event>)}) becomes
 * its explicit id, in the live table and the archive, and a row already on an explicit id is untouched.
 * Flyway has run V74 before the test, so it seeds old-format rows and re-executes the idempotent script.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class StableListenerIdMigrationIT {

	private static final String SCRIPT = "db/migration/V74__event_publication_stable_listener_ids.sql";

	@Autowired
	JdbcClient jdbc;

	@Test
	void mapsEveryDefaultIdToItsListenersExplicitId() throws Exception {
		Map<UUID, String> expected = new LinkedHashMap<>();
		for (Method listener : ListenerIdSnapshotTest.registryListeners()) {
			String defaultId = listener.getDeclaringClass().getName() + ".on("
					+ listener.getParameterTypes()[0].getName() + ")";
			String explicitId = ListenerIdSnapshotTest.explicitId(listener);
			expected.put(seed("event_publication", defaultId, listener), explicitId);
			expected.put(seed("event_publication_archive", defaultId, listener), explicitId);
			expected.put(seed("event_publication", explicitId, listener), explicitId);
		}

		jdbc.sql(new String(new ClassPathResource(SCRIPT).getInputStream().readAllBytes(), StandardCharsets.UTF_8))
				.update();

		expected.forEach((row, explicitId) -> assertThat(listenerIdOf(row)).as("row %s", row).isEqualTo(explicitId));
	}

	/** Seeded COMPLETED, so a resubmit in an IT sharing this context never delivers the synthetic payload. */
	private UUID seed(String table, String listenerId, Method listener) {
		UUID id = UUID.randomUUID();
		jdbc.sql("INSERT INTO " + table + " (id, listener_id, event_type, serialized_event, "
						+ "publication_date, completion_date) VALUES (:id, :listenerId, :eventType, '{}', now(), now())")
				.param("id", id).param("listenerId", listenerId)
				.param("eventType", listener.getParameterTypes()[0].getName())
				.update();
		return id;
	}

	private String listenerIdOf(UUID id) {
		return jdbc.sql("""
				SELECT listener_id FROM event_publication WHERE id = :id
				UNION ALL
				SELECT listener_id FROM event_publication_archive WHERE id = :id
				""").param("id", id).query(String.class).single();
	}
}
