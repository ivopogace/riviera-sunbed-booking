/**
 * Published <strong>ports</strong> surface of the {@code notification} module (invariant #11) —
 * "call-me" interfaces only: {@link MailSender}, the fire-and-forget transactional-mail send the
 * platform-edge flows drive. The port speaks JDK types only ({@code String}, {@code URI}), so there
 * is no sibling {@code vocabulary} surface. Consumed by the composition root alone; no module
 * depends on {@code notification}.
 */
@org.springframework.modulith.NamedInterface("api")
package ai.riviera.platform.notification.api;
