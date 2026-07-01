/**
 * Published <strong>ports</strong> surface of the {@code payment} module (invariant #11) —
 * "call-me" interfaces only: {@link CheckoutPort}, {@link CancelPaymentPort} and
 * {@link RefundPort}, all called by the {@code booking} module. The value types they speak
 * ({@code Money}, {@code BookingRef}, the sealed outcome hierarchies) live in the sibling
 * {@code vocabulary} named interface, the published domain events in {@code events}
 * (issue #95). The Stripe SDK lives behind the module's <em>outbound</em>
 * {@code PaymentGateway} in {@code application}, never here. Collect-only, no Connect
 * (invariant #8).
 */
@org.springframework.modulith.NamedInterface("api")
package ai.riviera.platform.payment.api;
