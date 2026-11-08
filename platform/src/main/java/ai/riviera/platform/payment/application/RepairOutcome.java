package ai.riviera.platform.payment.application;

/**
 * What an admin repair of one payment did. {@link #CONFIRMED} and {@link #CANCELED} moved the payment from the
 * provider's answer; every other outcome moved nothing, so a repeated press converges on {@link #ALREADY_SETTLED}.
 */
public enum RepairOutcome {
	CONFIRMED, CANCELED, ALREADY_SETTLED, NO_DIVERGENCE, NO_PAYEE, PROVIDER_UNAVAILABLE, UNKNOWN_PAYMENT
}
