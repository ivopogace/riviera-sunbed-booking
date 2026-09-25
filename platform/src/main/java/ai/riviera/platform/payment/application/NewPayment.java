package ai.riviera.platform.payment.application;

import java.util.List;

import ai.riviera.platform.payment.vocabulary.BookingRef;

/**
 * The data needed to persist a brand-new collection in {@code REQUIRES_PAYMENT}: the Stripe
 * {@code paymentIntentId} (the correlation handle the webhook looks up — we store the id, never card
 * data), the ISO currency, the client secret, and one {@link Share} per booking the intent collects
 * for (a technical id, invariant #11) with that booking's part of the total in integer minor units
 * (invariant #5). A stay is a group of bookings paid once, so an intent may carry several shares; a
 * single booking is one. A driven-port DTO, not exposed beyond {@code payment}.
 */
public record NewPayment(String paymentIntentId, String currency, String clientSecret, List<Share> shares) {

	/** One booking's part of the collection. */
	public record Share(BookingRef bookingRef, long amountMinor) {
	}

	public NewPayment {
		shares = List.copyOf(shares);
		if (shares.isEmpty()) {
			throw new IllegalArgumentException("a collection is for at least one booking");
		}
	}

	/** A collection for one booking whose share is the whole amount. */
	public NewPayment(BookingRef bookingRef, String paymentIntentId, long amountMinor, String currency,
			String clientSecret) {
		this(paymentIntentId, currency, clientSecret, List.of(new Share(bookingRef, amountMinor)));
	}

	/** The intent's total: the sum of its shares. */
	public long amountMinor() {
		return shares.stream().mapToLong(Share::amountMinor).sum();
	}
}
