/**
 * Payment bounded context — Stripe collection, PaymentIntents, refunds and
 * signature-verified webhook handling (invariant #8: webhooks are the source of
 * truth, collect-only, no Stripe Connect). Aggregate root: {@code Payment}.
 *
 * <p>Hexagonal layout (invariant #11, ADR-0007 full template, issue-#95 split surfaces):
 * {@code api} (the published inbound ports), {@code vocabulary} ({@code Money}, {@code BookingRef},
 * the sealed outcomes), {@code events} ({@code PaymentConfirmed}/{@code PaymentCanceled}),
 * {@code application} (services + their driving/driven
 * port interfaces), {@code domain} ({@code PaymentStatus}), {@code adapter.in} (the
 * signature-verified Stripe webhook controller), {@code adapter.out} (the Stripe gateway, the
 * stub gateway, the JDBC repositories, and the Stripe SDK wiring). No {@code spi} — this module
 * owns no cross-module dependency inversion.
 */
@org.springframework.modulith.ApplicationModule(
    displayName = "Payment",
    allowedDependencies = {}
)
package ai.riviera.platform.payment;
