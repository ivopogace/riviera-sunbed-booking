package ai.riviera.platform.booking.adapter.in;

import org.springframework.core.annotation.MergedAnnotations;
import org.springframework.transaction.event.TransactionalEventListener;

import ai.riviera.platform.booking.events.BookingCancelled;
import ai.riviera.platform.payment.events.PaymentCanceled;
import ai.riviera.platform.payment.events.PaymentConfirmed;

/**
 * The registry {@code listener_id}s of this package's listeners, <strong>read from each handler's
 * explicit {@code id}</strong> rather than typed again, so a fixture can never drift from the annotation.
 * It lives in {@code adapter/in} because the listeners are package-private here;
 * {@code RefundBulkheadIT.keepsTheListenerIdUnchanged} pins the value against what the registry writes.
 */
public final class BookingListenerIds {

	/** {@code BookingRefundListener} — the money-moving half of what the admin lever may re-drive. */
	public static final String REFUND = id(BookingRefundListener.class, BookingCancelled.class);

	/** {@code BookingDayRefundListener} — a refunded day's money (#1210), the lever's third allowed id. */
	public static final String DAY_REFUND = id(BookingDayRefundListener.class,
			ai.riviera.platform.booking.events.BookingDayRefunded.class);

	/** {@code RemodelReleasePaymentListener} — the intent-void half, the lever's second allowed id. */
	public static final String REMODEL_RELEASE_VOID =
			id(RemodelReleasePaymentListener.class, BookingCancelled.class);

	/** {@code PaymentEventListener}'s confirm branch — the invariant-#8 spine the lever must not reach. */
	public static final String PAYMENT_CONFIRMED = id(PaymentEventListener.class, PaymentConfirmed.class);

	/** {@code PaymentEventListener}'s cancel branch — releases availability, equally out of reach. */
	public static final String PAYMENT_CANCELED = id(PaymentEventListener.class, PaymentCanceled.class);

	private BookingListenerIds() {
	}

	private static String id(Class<?> listener, Class<?> event) {
		try {
			return MergedAnnotations.from(listener.getDeclaredMethod("on", event))
					.get(TransactionalEventListener.class)
					.getString("id");
		}
		catch (NoSuchMethodException e) {
			throw new IllegalStateException(listener.getName() + " has no on(" + event.getName() + ")", e);
		}
	}
}
