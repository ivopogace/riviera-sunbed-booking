package ai.riviera.platform.payment.adapter.out;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.Map;
import java.util.Optional;

import com.stripe.model.Refund;

import ai.riviera.platform.payment.domain.RefundScope;
import ai.riviera.platform.payment.vocabulary.BookingRef;

/**
 * The booking a Stripe {@link Refund} was issued for, carried in the refund's metadata. One
 * PaymentIntent may collect for several bookings, so a refund on it belongs to exactly one of them,
 * and Stripe is the only place that fact survives a lost response: the adapter writes it on create,
 * and reads it back both when listing what the gateway already holds and when a failure webhook
 * names a refund this app never got to record. Absent on every refund issued before the tag existed.
 * A day refund also carries its service day (#1210); a refund naming none is the whole share's.
 */
public final class StripeRefundTag {

	/** The metadata key; the value is the booking id in decimal. */
	public static final String KEY = "bookingRef";

	/** The day refund's metadata key; the value is the ISO service date. */
	public static final String DAY_KEY = "serviceDate";

	private StripeRefundTag() {
	}

	public static String of(BookingRef booking) {
		return Long.toString(booking.value());
	}

	/** The scope tag's value for a day refund; the whole share carries none. */
	public static Optional<String> dayOf(RefundScope scope) {
		return scope.isDay() ? Optional.of(scope.serviceDate().toString()) : Optional.empty();
	}

	/**
	 * The tagged scope: a day when the refund names one, the whole share when it names none; empty for
	 * a day tag that is not a date.
	 */
	public static Optional<RefundScope> scopeOf(Refund refund) {
		Map<String, String> metadata = refund.getMetadata();
		String day = metadata == null ? null : metadata.get(DAY_KEY);
		if (day == null) {
			return Optional.of(RefundScope.WHOLE);
		}
		try {
			return Optional.of(RefundScope.day(LocalDate.parse(day)));
		}
		catch (DateTimeParseException e) {
			return Optional.empty();
		}
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
