package ai.riviera.platform.payment;

import java.util.List;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.payment.application.WebhookEvents;
import ai.riviera.platform.payment.domain.PaymentProvider;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * V79 against a database that stopped at V78: an event recorded under the Stripe-only table must still
 * be recognised after the move, or a delivery in flight across the deployment would apply twice
 * (invariant #8). Its own Spring context (the Flyway target) gives it its own container.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "spring.flyway.target=78")
class WebhookDedupMigrationIT {

	@Autowired
	JdbcClient jdbc;

	@Autowired
	Flyway flyway;

	@Autowired
	WebhookEvents webhookEvents;

	@Test
	void existingEventsBecomeStripesAndStayDeduplicated() {
		jdbc.sql("""
				INSERT INTO stripe_webhook_event (event_id, event_type)
				VALUES ('evt_v79_a', 'payment_intent.succeeded'), ('evt_v79_b', 'refund.failed')
				""").update();

		Flyway.configure().configuration(flyway.getConfiguration()).target(MigrationVersion.fromVersion("79"))
				.load().migrate();

		assertEquals(List.of("STRIPE evt_v79_a payment_intent.succeeded", "STRIPE evt_v79_b refund.failed"),
				jdbc.sql("""
						SELECT provider || ' ' || reference || ' ' || event_type FROM payment_webhook_event
						WHERE reference LIKE 'evt_v79_%' ORDER BY reference
						""").query(String.class).list(),
				"every recorded event keeps its id and type and reads as Stripe's");
		assertTrue(jdbc.sql("SELECT to_regclass('stripe_webhook_event') IS NULL").query(Boolean.class).single(),
				"the Stripe-named table is gone, so nothing can keep writing the old shape");
		assertFalse(webhookEvents.firstSeen(PaymentProvider.STRIPE, "evt_v79_a", "payment_intent.succeeded"),
				"an event recorded before the migration is still a duplicate after it");
		assertTrue(webhookEvents.firstSeen(PaymentProvider.POK, "evt_v79_a", "COMPLETED"),
				"another provider's identical reference is its own");
	}
}
