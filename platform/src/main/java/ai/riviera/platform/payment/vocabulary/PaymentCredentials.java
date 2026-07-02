package ai.riviera.platform.payment.vocabulary;

/**
 * The credentials a payer's browser needs to complete an open PaymentIntent with Stripe.js
 * (issue #98, pay-on-accept): the {@code clientSecret} Elements mounts with, and the
 * {@code paymentIntentId} for reference. Scoped to the payer by Stripe design; the platform
 * hands it out only on the code-gated booking view while the booking is
 * {@code AWAITING_PAYMENT} — the booking code is the bearer credential (invariant #7).
 */
public record PaymentCredentials(String clientSecret, String paymentIntentId) {
}
