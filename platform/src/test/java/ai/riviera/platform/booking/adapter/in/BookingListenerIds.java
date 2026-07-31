package ai.riviera.platform.booking.adapter.in;

import ai.riviera.platform.booking.events.BookingCancelled;
import ai.riviera.platform.payment.events.PaymentCanceled;
import ai.riviera.platform.payment.events.PaymentConfirmed;

/**
 * The registry {@code listener_id}s of this package's listeners, <strong>derived from the class
 * literals</strong> rather than typed as strings — so a rename that would change what the registry
 * writes breaks these fixtures at compile time instead of silently un-matching every test that pins
 * them (#454; the improvement over {@code BookingMailFixtures}' hand-typed ids).
 *
 * <p>It lives in {@code adapter/in} because the listeners are package-private here; the derivation is
 * Spring Modulith's default id format, FQCN + {@code .on(} + parameter FQCN + {@code )}, which
 * {@code RefundBulkheadIT.keepsTheListenerIdUnchanged} pins against what the running registry actually
 * writes — the second level of #405's R-6, anchored to the same value as the first.
 */
public final class BookingListenerIds {

	/** {@code BookingRefundListener} — the one id the #454 admin lever is allowed to re-drive. */
	public static final String REFUND = id(BookingRefundListener.class, BookingCancelled.class);

	/** {@code PaymentEventListener}'s confirm branch — the invariant-#8 spine the lever must not reach. */
	public static final String PAYMENT_CONFIRMED = id(PaymentEventListener.class, PaymentConfirmed.class);

	/** {@code PaymentEventListener}'s cancel branch — releases availability, equally out of reach. */
	public static final String PAYMENT_CANCELED = id(PaymentEventListener.class, PaymentCanceled.class);

	private BookingListenerIds() {
	}

	private static String id(Class<?> listener, Class<?> event) {
		return listener.getName() + ".on(" + event.getName() + ")";
	}
}
