/**
 * Notification bounded context (#382) — transactional-mail delivery, moved off the platform root so
 * the root goes back to being a pure composition root + auth edge. It owns the mail transports
 * (real SMTP vs the recording mock, profile-swapped), the two delivery vehicles — the Event
 * Publication Registry listener for ids-only payloads and the bounded in-memory dispatcher for
 * bearer-credential payloads (ADR-0011 decision 5) — and, since #380, two tables of its own. The first is the
 * <strong>email-suppression list</strong> (hashed/non-PII at rest since #388/ADR-0012 — a peppered
 * HMAC key + cleartext domain, never the address), with its defining invariant <em>no send to a
 * suppressed address</em>, enforced on both vehicles at the {@code application} chokepoint. Since
 * #391 that state has a lift: an ADMIN-gated reinstatement marks a row {@code reinstated_at} rather
 * than deleting it, so the invariant tracks the flag and the deliverability record still survives.
 * The second is the <strong>booking-confirmation delivery log</strong> (V36, #380): one row per send
 * attempt with its trigger and its outcome, read by an ADMIN lookup-by-address and re-driven by a
 * one-click resend. It exists because the Event Publication Registry cannot answer the question —
 * {@code completion_date} records that the listener <em>returned</em>, equally true of a suppression
 * skip and of a #428 abandonment — so the two silent losses would read as "dispatched".
 *
 * <p>Hexagonal layout (invariant #11, ADR-0007 full template): {@code api} publishes two role-split
 * ports the edge flows call — the fire-and-forget send port ({@code MailSender}) and, since #400, the
 * synchronous {@code MailDeliverability} read that lets the authenticated verification-resend stop
 * claiming a mail was sent when suppression withheld it; {@code application} holds the
 * chokepoint service, the internal transport/dispatch/suppression ports and the dispatcher;
 * {@code adapter/in} the five registry listeners — {@code BookingConfirmed}, since #374
 * {@code BookingCancelled}, since #373 {@code BookingPaymentDue}, and since #124
 * {@code BookingRequestDeclined} + {@code BookingRequestExpired} (all driving adapters, all on
 * the mail bulkhead) — plus the config that binds them their properties; {@code adapter/out}
 * the transports and the suppression repository. No {@code domain} — the module owns table-backed
 * state but no aggregate yet (the single {@code SuppressionReason} enum rides with its port).
 *
 * <p>The edge keeps deciding <em>when</em> to send and keeps all <strong>credential-material</strong>
 * machinery — minting a token, hashing it, deciding its TTL, and building the link that carries it
 * (RV-BE-11). For the edge-triggered kinds this module is therefore handed fully-formed links and owns
 * only delivery.
 *
 * <p><strong>#373 drew the one line that rule always implied but never had to state.</strong> The
 * registry-borne booking mails are raised <em>inside</em> the hexagon by listeners, so there is no
 * edge flow holding a request to build anything; and the arrival code cannot ride the event payload,
 * which the registry persists as text (invariant #7). So {@code BookingLinks} formats
 * {@code <base>/booking/<code>} here, from a code this module already reads through {@code booking::api}
 * to render into the body. That mints nothing and hashes nothing — it is presentation of a fact
 * already in hand, which is what keeps it on this side of RV-BE-11. Nothing depends on
 * {@code notification} except the root.
 *
 * <p>The grants below are the five registry listeners' reads, least-privilege (#95) — no command
 * surface; #374, #373 and #124 each added listeners without widening them, because all five assemble
 * the same facts through one shared resolver. {@code shared} is the OPEN kernel, granted for the admin adapter's RFC-7807
 * {@code ApiProblem} factory (#391); it publishes no named interfaces, so the whole (deliberately
 * tiny) module root is the narrowest grant available, exactly as {@code payout} declares it.
 * {@code booking::spi} is the one <em>inbound</em> grant (#390): booking declares
 * {@code ConfirmationMailDelivery} and this module implements it, so a confirmed booking's read
 * model can report that its confirmation mail was withheld without booking depending on
 * notification — which would cycle against the two grants above it.
 */
@org.springframework.modulith.ApplicationModule(
	displayName = "Notification",
	allowedDependencies = { "booking::api", "booking::events", "booking::spi", "booking::vocabulary",
			"customer::api", "customer::vocabulary", "venue::api", "venue::vocabulary", "shared" }
)
package ai.riviera.platform.notification;
