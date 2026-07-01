package ai.riviera.platform.payment.api;

import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.Money;
import ai.riviera.platform.payment.vocabulary.PaymentOutcome;

/**
 * The {@code payment} module's <strong>inbound</strong> published port (invariant #11) — the
 * one seam the {@code booking} module calls to collect for a booking. Deliberately distinct
 * from the module's <strong>outbound</strong> {@code PaymentGateway} (the driven Stripe/stub
 * SDK seam): one is driving, one is driven (riviera-stripe-payments).
 *
 * <p>Collect-only — <strong>no Stripe Connect</strong> (the platform collects everything and
 * pays venues manually via BKT; invariant #8). In U3 this is backed by a stub that succeeds
 * synchronously; U4 swaps the outbound gateway for Stripe and moves success onto a
 * signature-verified webhook without changing this port's shape.
 */
public interface CheckoutPort {

	/**
	 * Collect {@code amount} for the given booking. Returns a typed {@link PaymentOutcome};
	 * the caller confirms the booking only on {@link PaymentOutcome.Succeeded}.
	 */
	PaymentOutcome pay(BookingRef booking, Money amount);
}
