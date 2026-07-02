package ai.riviera.platform.payment.api;

import java.util.Optional;

import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.PaymentCredentials;

/**
 * The read side of the checkout conversation (issue #98), split from {@link CheckoutPort} by
 * consumer role (the issue-#94 precedent, like {@code CancelPaymentPort}): the booking view asks
 * "is there an open, payable intent for this booking?" so a Request-to-Book guest can pay AFTER
 * the venue accepts — the PaymentIntent is created at accept time and the {@code clientSecret}
 * picked up later from the code-gated booking view.
 */
public interface PaymentCredentialsLookup {

	/**
	 * The credentials of the booking's still-open PaymentIntent, or empty when none is payable
	 * (no payment initiated, already succeeded/failed/canceled, or a stub-profile collection).
	 */
	Optional<PaymentCredentials> pendingCredentials(BookingRef booking);
}
