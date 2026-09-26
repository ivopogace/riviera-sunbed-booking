/**
 * Published "call-me" <strong>ports</strong> of the {@code payment} module (invariant #11), all
 * called by {@code booking}: the command ports {@link CheckoutPort}, {@link CancelPaymentPort} and
 * {@link RefundPort}; the read-side ports split by consumer role ({@link PaymentCredentialsLookup},
 * {@link RefundStatusLookup}); and the deployment-posture query {@link CollectionGuarantee}. Value
 * types live in {@code vocabulary}, events in {@code events}. The Stripe SDK stays behind the
 * outbound {@code PaymentGateway}, never here. Collect-only, no Connect (ADR-0002).
 */
@org.springframework.modulith.NamedInterface("api")
package ai.riviera.platform.payment.api;
