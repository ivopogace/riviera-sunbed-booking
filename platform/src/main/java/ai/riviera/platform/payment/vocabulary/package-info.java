/**
 * Published <strong>vocabulary</strong> of the {@code payment} module (invariant #11, issue
 * #95) — {@link Money} (integer minor units + ISO currency, invariant #5), the
 * {@link BookingRef} typed id, and the sealed outcome hierarchies the ports return
 * ({@link PaymentOutcome}, {@link PaymentCancellation}, {@link RefundResult}). Value types
 * only, never ports — "call-me" interfaces live in the sibling {@code api} named interface.
 * Granted as {@code payment::vocabulary} to consumers per least privilege.
 */
@org.springframework.modulith.NamedInterface("vocabulary")
package ai.riviera.platform.payment.vocabulary;
