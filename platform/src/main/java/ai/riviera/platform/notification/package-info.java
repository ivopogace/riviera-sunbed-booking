/**
 * Transactional-mail delivery: the profile-swapped {@code Mailer} transports and ADR-0011's two
 * vehicles — registry listener for ids-only payloads, in-memory dispatcher for bearer-credential ones
 * (invariant #7). Sole writer of {@code email_suppression} (hashed, never deleted, ADR-0012; no send
 * to a suppressed address, enforced at the {@code application} chokepoint) and
 * {@code booking_confirmation_mail_attempt}. Grants are listener reads only; {@code booking::spi} is
 * implemented here, not called. Rationale: {@code RESPONSIBILITIES.md} §{@code notification}.
 */
@org.springframework.modulith.ApplicationModule(
	displayName = "Notification",
	allowedDependencies = { "booking::api", "booking::events", "booking::spi", "booking::vocabulary",
			"customer::api", "customer::vocabulary", "venue::api", "venue::vocabulary", "shared" }
)
package ai.riviera.platform.notification;
