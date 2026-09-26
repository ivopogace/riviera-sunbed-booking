/**
 * The payment module: Stripe collection, PaymentIntents, refunds and signature-verified webhook
 * handling (invariant #8: webhooks are the source of truth). Collect-only, no Stripe Connect
 * (ADR-0002). One {@code payment} row per PaymentIntent, which may collect for several bookings; each
 * has a {@code payment_booking} row carrying its share and its at-most-one refund.
 *
 * <p>ADR-0007 full hexagonal template (invariant #11); no {@code spi}, as it owns no inversion.
 */
@org.springframework.modulith.ApplicationModule(
    displayName = "Payment",
    allowedDependencies = { "shared" }
)
package ai.riviera.platform.payment;
