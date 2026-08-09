package ai.riviera.platform.payment.api;

import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.RefundProgress;

/**
 * The read side of the refund conversation, split from {@link RefundPort} by consumer role (like
 * {@code PaymentCredentialsLookup} vs {@code CheckoutPort}): the booking view asks "has the
 * gateway accepted this booking's refund?" so a cancelled booking can say a refund is still being
 * processed instead of claiming it is on its way to the card.
 */
public interface RefundStatusLookup {

	/**
	 * The gateway's refund progress for the booking. Total: answers {@link RefundProgress#NO_COLLECTION}
	 * when this gateway never collected (stub profile, or an intent that never succeeded) — the caller
	 * must not read that as a stuck refund.
	 */
	RefundProgress progressOf(BookingRef booking);
}
