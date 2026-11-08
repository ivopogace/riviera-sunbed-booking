package ai.riviera.platform.payment.adapter.out;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.payment.application.WebhookEvents;
import ai.riviera.platform.payment.domain.PaymentProvider;

/**
 * JDBC adapter for {@link WebhookEvents} — explicit SQL via {@link JdbcClient}, no JPA (invariant #1). The
 * dedup is an atomic {@code INSERT … ON CONFLICT (provider, reference) DO NOTHING}: rows-affected {@code 1}
 * means first delivery (process it), {@code 0} means already seen (skip). Package-private; only the port is
 * referenced cross-layer.
 */
@Repository
class JdbcWebhookEvents implements WebhookEvents {

	private final JdbcClient jdbc;

	JdbcWebhookEvents(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public boolean firstSeen(PaymentProvider provider, String reference, String eventType) {
		int inserted = jdbc.sql("""
				INSERT INTO payment_webhook_event (provider, reference, event_type)
				VALUES (:provider, :reference, :type)
				ON CONFLICT (provider, reference) DO NOTHING
				""")
				.param("provider", provider.name())
				.param("reference", reference)
				.param("type", eventType)
				.update();
		return inserted == 1;
	}
}
