/**
 * Notification bounded context (#382) — transactional-mail delivery, moved off the platform root so
 * the root goes back to being a pure composition root + auth edge. It owns the mail transports
 * (real SMTP vs the recording mock, profile-swapped), the two delivery vehicles — the Event
 * Publication Registry listener for ids-only payloads and the bounded in-memory dispatcher for
 * bearer-credential payloads (ADR-0011 decision 5) — and the module's first owned state: the
 * <strong>email-suppression list</strong> (hashed/non-PII at rest since #388/ADR-0012 — a peppered
 * HMAC key + cleartext domain, never the address), with its defining invariant <em>no send to a
 * suppressed address</em>, enforced on both vehicles at the {@code application} chokepoint.
 *
 * <p>Hexagonal layout (invariant #11, ADR-0007 full template): {@code api} publishes the one
 * fire-and-forget send port the edge flows call ({@code MailSender}); {@code application} holds the
 * chokepoint service, the internal transport/dispatch/suppression ports and the dispatcher;
 * {@code adapter/in} the {@code BookingConfirmed} listener (a driving adapter); {@code adapter/out}
 * the transports and the suppression repository. No {@code domain} — the module owns table-backed
 * state but no aggregate yet (the single {@code SuppressionReason} enum rides with its port).
 *
 * <p>The edge keeps deciding <em>when</em> to send and keeps all credential-material machinery
 * (token minting/hashing, link building — RV-BE-11); this module is handed fully-formed links and
 * booking facts and owns only delivery. Nothing depends on {@code notification} except the root.
 */
@org.springframework.modulith.ApplicationModule(
	displayName = "Notification",
	// The BookingConfirmed listener's reads, least-privilege (#95) — no command surface granted.
	// "shared" is the OPEN kernel, granted for the admin adapter's RFC-7807 ApiProblem factory (#391);
	// it has no named interfaces, so the whole (deliberately tiny) module root is the narrowest grant.
	allowedDependencies = { "booking::api", "booking::events", "booking::vocabulary",
			"customer::api", "customer::vocabulary", "venue::api", "venue::vocabulary", "shared" }
)
package ai.riviera.platform.notification;
