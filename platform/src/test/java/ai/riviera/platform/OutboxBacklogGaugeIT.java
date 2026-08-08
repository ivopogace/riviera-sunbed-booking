package ai.riviera.platform;

import ai.riviera.platform.shared.ObservabilityMetrics;
import java.util.UUID;

import io.micrometer.core.instrument.MeterRegistry;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * AC-4: the {@code riviera.outbox.pending} gauge reflects the number of incomplete
 * Spring Modulith event publications (the outbox backlog). Testcontainers against real Postgres —
 * the gauge runs a live {@code count(*)} over {@code event_publication} at read time. Inserts use a
 * distinctive {@code listener_id} and are cleaned up so a reused container stays clean.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class OutboxBacklogGaugeIT {

	private static final String TEST_LISTENER = "obs-backlog-it";

	@Autowired
	MeterRegistry meters;

	@Autowired
	JdbcClient jdbc;

	@AfterEach
	void removeSeededPublications() {
		jdbc.sql("DELETE FROM event_publication WHERE listener_id = :listener").param("listener", TEST_LISTENER).update();
	}

	@Test
	void gaugeReflectsIncompletePublicationCount() {
		double before = pendingGauge();

		seedPendingPublication();
		seedPendingPublication();

		assertEquals(before + 2, pendingGauge(), "the gauge counts incomplete event_publication rows");
	}

	private double pendingGauge() {
		return meters.get(ObservabilityMetrics.OUTBOX_PENDING).gauge().value();
	}

	private void seedPendingPublication() {
		jdbc.sql("""
				INSERT INTO event_publication (id, listener_id, event_type, serialized_event, publication_date)
				VALUES (:id, :listener, :type, :payload, now())
				""")
				.param("id", UUID.randomUUID())
				.param("listener", TEST_LISTENER)
				.param("type", "ai.riviera.test.ObservabilityProbe")
				.param("payload", "{}")
				.update();
	}
}
