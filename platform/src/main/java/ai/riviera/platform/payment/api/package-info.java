/**
 * Published surface of the {@code payment} module (invariant #11) — the inbound
 * {@link ai.riviera.platform.payment.api.CheckoutPort} the {@code booking} module calls,
 * plus the {@link ai.riviera.platform.payment.api.Money},
 * {@link ai.riviera.platform.payment.api.BookingRef} and
 * {@link ai.riviera.platform.payment.api.PaymentOutcome} value types it speaks. The Stripe
 * SDK (U4) lives behind the module's <em>outbound</em> {@code PaymentGateway} in
 * {@code application.out}, never here. Collect-only, no Connect (invariant #8).
 */
@org.springframework.modulith.NamedInterface("api")
package ai.riviera.platform.payment.api;
