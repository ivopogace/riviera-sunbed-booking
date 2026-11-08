package ai.riviera.platform.payment.application;

/**
 * Applies a provider-verified payment state (a signature-verified webhook, or an authenticated provider read; never
 * the client, invariant #8) through the guarded transition. Each answers whether this call moved the record, and
 * publishes the booking events only if it did, so a late or repeated verdict changes nothing.
 */
public interface VerifiedPaymentOutcomes {

	/** The payment was collected: the row moves to {@code SUCCEEDED} and each of its bookings is confirmed. */
	boolean succeeded(String reference);

	/** The payment can never be collected: the row moves to {@code CANCELED} and each of its bookings is released. */
	boolean canceled(String reference);

	/** A collection attempt failed but the guest may retry it: the row moves to the retryable {@code FAILED}. */
	boolean failed(String reference);
}
