package ai.riviera.platform.payment.api;

import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.PaymentCancellation;

/**
 * The {@code payment} module's <strong>inbound</strong> port (invariant #11) for voiding an unpaid
 * booking's PaymentIntent, called by {@code booking}'s abandoned-payment sweep (a closed tab sends no
 * terminating webhook) and its remodel release. Moves no money: collect-only, no Connect (ADR-0002).
 *
 * <p><strong>Idempotent</strong>: an already-canceled intent is a benign success. One that has
 * {@code succeeded} is {@link PaymentCancellation.NotCancellable}: leave the booking to the
 * signature-verified confirm webhook (invariant #8). Intent state comes from Stripe, not the client.
 */
public interface CancelPaymentPort {

	/**
	 * Cancel the PaymentIntent collecting for {@code booking}. Returns a typed
	 * {@link PaymentCancellation} (never throws on an expected gateway failure / missing collection).
	 */
	PaymentCancellation cancel(BookingRef booking);
}
