package ai.riviera.platform.payment.api;

import java.util.List;

import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.CollectionShare;
import ai.riviera.platform.payment.vocabulary.Money;
import ai.riviera.platform.payment.vocabulary.PayeeRef;
import ai.riviera.platform.payment.vocabulary.PaymentOutcome;

/**
 * The {@code payment} module's <strong>inbound</strong> published port (invariant #11): the one seam
 * {@code booking} calls to collect for a booking, or for a stay's bookings at once under one
 * collection (design D8). Distinct from the <strong>outbound</strong> {@code PaymentGateway}, the
 * driven provider seam. The stub succeeds synchronously; under a collecting gateway only a verified
 * webhook confirms (invariant #8), never the client.
 */
public interface CheckoutPort {

	/**
	 * Collect every share in one collection, all in one currency and paying one venue (else
	 * {@link PaymentOutcome.MixedPayees}, with no gateway call). Returns a typed {@link PaymentOutcome};
	 * the caller confirms the bookings only on {@link PaymentOutcome.Succeeded}.
	 */
	PaymentOutcome pay(List<CollectionShare> shares);

	/** Collect {@code amount} for the given booking, paying {@code payee}: a collection of one share. */
	default PaymentOutcome pay(BookingRef booking, PayeeRef payee, Money amount) {
		return pay(List.of(new CollectionShare(booking, payee, amount)));
	}
}
