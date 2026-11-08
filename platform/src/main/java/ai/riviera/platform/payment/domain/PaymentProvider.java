package ai.riviera.platform.payment.domain;

/**
 * The payment providers whose notifications {@code payment_webhook_event} records. Mirrors that table's
 * {@code provider} CHECK (V79) one-to-one: keep the enum and the SQL token set in lockstep.
 */
public enum PaymentProvider {
	STRIPE,
	POK,
	PAYSERA
}
