package ai.riviera.platform.payment.api;

import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.Money;
import ai.riviera.platform.payment.vocabulary.PaymentOutcome;

/**
 * The {@code payment} module's <strong>inbound</strong> published port (invariant #11): the one
 * seam {@code booking} calls to collect for a booking. Distinct from the <strong>outbound</strong>
 * {@code PaymentGateway}, the driven Stripe/stub seam (riviera-stripe-payments). Collect-only,
 * <strong>no Stripe Connect</strong>: venues are paid manually via BKT (ADR-0002).
 *
 * <p>The default-profile stub succeeds synchronously; under {@code stripe}, only a signature-verified
 * webhook confirms the booking (invariant #8), never the client.
 */
public interface CheckoutPort {

	/**
	 * Collect {@code amount} for the given booking. Returns a typed {@link PaymentOutcome};
	 * the caller confirms the booking only on {@link PaymentOutcome.Succeeded}.
	 */
	PaymentOutcome pay(BookingRef booking, Money amount);
}
