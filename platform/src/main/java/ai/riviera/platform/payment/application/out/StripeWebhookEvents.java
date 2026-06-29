package ai.riviera.platform.payment.application.out;

/**
 * The {@code payment} module's outbound port for Stripe webhook idempotency (invariant #8).
 * Stripe re-delivers events, so every event is recorded by its id before processing; a second
 * delivery of the same id is a no-op. Implemented by {@code JdbcStripeWebhookEvents} as an
 * atomic {@code INSERT … ON CONFLICT DO NOTHING} (the same concurrency primitive as the
 * availability claim). Internal to the module.
 */
public interface StripeWebhookEvents {

	/**
	 * Record that an event was received. Returns {@code true} if this is the <strong>first</strong>
	 * time the id is seen (the caller should process it), or {@code false} if it was already
	 * recorded (a duplicate — the caller skips it).
	 */
	boolean firstSeen(String eventId, String eventType);
}
