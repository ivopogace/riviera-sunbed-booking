/**
 * Published <strong>ports</strong> surface of the {@code notification} module (invariant #11) —
 * "call-me" interfaces only, <strong>split by role</strong>:
 * <ul>
 *   <li>{@link MailSender} — the fire-and-forget transactional-mail send the platform-edge flows
 *       drive: never throws, runs off the caller's thread, influences neither the triggering
 *       response's status (D-8) nor its latency.</li>
 *   <li>{@link MailDeliverability} — the synchronous read "would a mail to this address be
 *       withheld right now?", whose whole purpose is to be reflected in a response. Deliberately not
 *       a method on {@code MailSender}: that would put an answer on a port whose contract is that
 *       there is none, for callers ({@code forgot-password}) that must not have one.</li>
 * </ul>
 * Both speak JDK types only ({@code String}, {@code URI}, {@code boolean}), so there is no sibling
 * {@code vocabulary} surface. Consumed by the composition root alone; no module depends on
 * {@code notification}.
 */
@org.springframework.modulith.NamedInterface("api")
package ai.riviera.platform.notification.api;
