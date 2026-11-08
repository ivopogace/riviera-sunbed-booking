package ai.riviera.platform.payment.application;

/**
 * What the provider's authoritative record says of one payment (invariant #8): {@link Paid}, {@link Canceled}
 * (canceled or expired, it can never be paid), {@link Waiting} (still payable or in flight), or {@link Unavailable}
 * when no answer could be read. {@code reason} is a short non-PII code.
 */
public sealed interface ProviderPaymentState {

	record Paid() implements ProviderPaymentState {
	}

	record Canceled() implements ProviderPaymentState {
	}

	record Waiting() implements ProviderPaymentState {
	}

	record Unavailable(String reason) implements ProviderPaymentState {
	}
}
