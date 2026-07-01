/**
 * Published <strong>events</strong> of the {@code payment} module (invariant #11, issue #95)
 * — {@link PaymentConfirmed} and {@link PaymentCanceled}, the webhook-derived facts the
 * {@code booking} module listens for (id-based payloads; webhooks are the source of truth,
 * invariant #8). Event records only — ports live in {@code api}, value types in
 * {@code vocabulary}. Granted as {@code payment::events} to listener modules per least
 * privilege.
 */
@org.springframework.modulith.NamedInterface("events")
package ai.riviera.platform.payment.events;
