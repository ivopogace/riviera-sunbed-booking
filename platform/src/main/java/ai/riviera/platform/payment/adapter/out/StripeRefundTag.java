package ai.riviera.platform.payment.adapter.out;

import java.util.Map;
import java.util.Optional;

import com.stripe.model.Refund;

import ai.riviera.platform.payment.vocabulary.BookingRef;

/**
 * The booking a Stripe {@link Refund} was issued for, carried in the refund's metadata. One
 * PaymentIntent may collect for several bookings, so a refund on it belongs to exactly one of them,
 * and Stripe is the only place that fact survives a lost response: the adapter writes it on create,
 * and reads it back both when listing what the gateway already holds and when a failure webhook
 * names a refund this app never got to record. Absent on every refund issued before the tag existed.
 */
public final class StripeRefundTag {

	/** The metadata key; the value is the booking id in decimal. */
	public static final String KEY = "bookingRef";

	private StripeRefundTag() {
	}

	public static String of(BookingRef booking) {
		return Long.toString(booking.value());
	}

	/** The tagged booking, or empty when the refund carries no tag or one that is not a booking id. */
	public static Optional<BookingRef> bookingOf(Refund refund) {
		Map<String, String> metadata = refund.getMetadata();
		String tag = metadata == null ? null : metadata.get(KEY);
		if (tag == null) {
			return Optional.empty();
		}
		try {
			return Optional.of(new BookingRef(Long.parseLong(tag)));
		}
		catch (NumberFormatException e) {
			return Optional.empty();
		}
	}
}
