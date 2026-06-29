package ai.riviera.platform.payment.application.out;

import ai.riviera.platform.payment.api.BookingRef;

/**
 * The data needed to persist a brand-new {@code payment} row in {@code REQUIRES_PAYMENT}: the
 * booking it collects for (a technical id, invariant #11), the Stripe {@code paymentIntentId}
 * (the correlation handle the webhook looks up — we store the id, never card data), and the
 * amount in integer minor units + ISO currency (invariant #5). A driven-port DTO, not exposed
 * beyond {@code payment}.
 */
public record NewPayment(BookingRef bookingRef, String paymentIntentId, long amountMinor,
		String currency) {
}
