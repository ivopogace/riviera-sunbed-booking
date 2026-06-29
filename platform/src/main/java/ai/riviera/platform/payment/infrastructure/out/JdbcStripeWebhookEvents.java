package ai.riviera.platform.payment.infrastructure.out;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.payment.application.out.StripeWebhookEvents;

/**
 * JDBC adapter for {@link StripeWebhookEvents} — explicit SQL via {@link JdbcClient}, no JPA
 * (invariant #1). The dedup is an atomic {@code INSERT … ON CONFLICT (event_id) DO NOTHING}:
 * rows-affected {@code 1} means first delivery (process it), {@code 0} means already seen (skip).
 * Package-private; only the port is referenced cross-layer.
 */
@Repository
class JdbcStripeWebhookEvents implements StripeWebhookEvents {

	private final JdbcClient jdbc;

	JdbcStripeWebhookEvents(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public boolean firstSeen(String eventId, String eventType) {
		int inserted = jdbc.sql("""
				INSERT INTO stripe_webhook_event (event_id, event_type)
				VALUES (:id, :type)
				ON CONFLICT (event_id) DO NOTHING
				""")
				.param("id", eventId)
				.param("type", eventType)
				.update();
		return inserted == 1;
	}
}
