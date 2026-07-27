package ai.riviera.platform.notification;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pins the V31 listener_id rewrite (#382, AC-7): {@code BookingConfirmationMailListener} moved from
 * the platform root into {@code notification.adapter.in}, and the Event Publication Registry's
 * {@code listener_id} embeds the listener class FQCN — restart republication matches it string-equal
 * against live listeners and dead-letters a row nothing matches (the V18 lesson). Flyway has already
 * run V31 against this container by the time the test starts, so the migration cannot be observed on
 * real pre-deploy rows; instead the test seeds a row in the OLD format and re-executes the V31
 * script — the file is idempotent by construction (a LIKE-guarded prefix replace), so re-running it
 * is exactly its production semantics. A row already in the new format must pass through unchanged.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ListenerMoveMigrationIT {

	private static final String OLD_LISTENER_ID =
			"ai.riviera.platform.BookingConfirmationMailListener.on(ai.riviera.platform.booking.events.BookingConfirmed)";
	private static final String NEW_LISTENER_ID =
			"ai.riviera.platform.notification.adapter.in.BookingConfirmationMailListener.on(ai.riviera.platform.booking.events.BookingConfirmed)";
	private static final String EVENT_TYPE = "ai.riviera.platform.booking.events.BookingConfirmed";

	@Autowired
	JdbcClient jdbc;

	@Test
	void rewritesTheOldListenerIdAndLeavesTheNewOneAlone() throws Exception {
		UUID oldRow = seed(OLD_LISTENER_ID);
		UUID newRow = seed(NEW_LISTENER_ID);

		String script = new String(
				new ClassPathResource("db/migration/V31__event_publication_listener_move.sql")
						.getInputStream().readAllBytes(),
				StandardCharsets.UTF_8);
		jdbc.sql(script).update();

		try {
			assertThat(listenerIdOf(oldRow)).isEqualTo(NEW_LISTENER_ID);
			assertThat(listenerIdOf(newRow)).isEqualTo(NEW_LISTENER_ID);
		}
		finally {
			jdbc.sql("DELETE FROM event_publication WHERE id IN (:a, :b)")
					.param("a", oldRow).param("b", newRow).update();
		}
	}

	/**
	 * Seeded COMPLETED (not outstanding) on purpose: this class may share its cached Spring context
	 * with ITs that resubmit incomplete publications, and an outstanding row with a synthetic payload
	 * would be delivered mid-suite. V31's UPDATE carries no completion filter, so a completed row
	 * proves the rewrite just as well.
	 */
	private UUID seed(String listenerId) {
		UUID id = UUID.randomUUID();
		jdbc.sql("""
				INSERT INTO event_publication (id, listener_id, event_type, serialized_event, publication_date, completion_date)
				VALUES (:id, :listenerId, :eventType, '{}', now(), now())
				""")
				.param("id", id).param("listenerId", listenerId).param("eventType", EVENT_TYPE)
				.update();
		return id;
	}

	private String listenerIdOf(UUID id) {
		return jdbc.sql("SELECT listener_id FROM event_publication WHERE id = :id")
				.param("id", id).query(String.class).single();
	}
}
