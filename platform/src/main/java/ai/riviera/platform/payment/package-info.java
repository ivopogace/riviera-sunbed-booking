/**
 * Payment bounded context — Stripe collection, PaymentIntents, refunds and
 * signature-verified webhook handling (invariant #8: webhooks are the source of
 * truth, collect-only, no Stripe Connect). Aggregate root: {@code Payment}.
 *
 * <p>Hexagonal layout (invariant #11): {@code api}, {@code application.in/out},
 * {@code domain}, {@code infrastructure.in/out}.
 */
@org.springframework.modulith.ApplicationModule(
    displayName = "Payment",
    allowedDependencies = {}
)
package ai.riviera.platform.payment;
