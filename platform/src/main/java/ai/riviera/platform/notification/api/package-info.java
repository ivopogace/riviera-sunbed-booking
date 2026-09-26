/**
 * Published <strong>ports</strong> surface of {@code notification} (invariant #11), by role:
 * {@link MailSender}, the fire-and-forget send (never throws, runs off the caller's thread, moves
 * neither the triggering response's status (D-8) nor its latency); {@link MailDeliverability}, the
 * synchronous "would a mail to this address be withheld now?", kept off {@code MailSender} so its
 * no-answer callers ({@code forgot-password}) cannot get one. JDK types only; consumed by the
 * composition root alone. Rationale: RESPONSIBILITIES.md §notification.
 */
@org.springframework.modulith.NamedInterface("api")
package ai.riviera.platform.notification.api;
