package ai.riviera.platform.payment.application;

import ai.riviera.platform.payment.domain.PaymentProvider;

/**
 * The {@code payment} module's outbound port for webhook dedup. Providers re-deliver notifications, so
 * each is recorded before processing and a repeat is a no-op (invariant #8). Implemented by
 * {@code JdbcWebhookEvents} as an atomic {@code INSERT … ON CONFLICT DO NOTHING} (the same concurrency
 * primitive as the availability claim). Internal to the module.
 */
public interface WebhookEvents {

	/**
	 * {@code true} the first time this provider's reference is seen (process it), {@code false} for a repeat
	 * (skip it). The reference is the provider's event id or, if it sends none, one the adapter derives from
	 * what identifies the notification, its verified state included (ADR-0029 decision 4).
	 */
	boolean firstSeen(PaymentProvider provider, String reference, String eventType);
}
