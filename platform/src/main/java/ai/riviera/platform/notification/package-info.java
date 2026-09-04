/**
 * The notification module — transactional-mail delivery. It owns the mail transports (real SMTP
 * vs the recording mock, profile-swapped), the two delivery vehicles — the Event Publication Registry
 * listener for ids-only payloads and the bounded in-memory dispatcher for bearer-credential ones
 * (ADR-0011 decision 5) — and two tables of its own. The <strong>email-suppression list</strong>
 * (hashed/non-PII at rest, ADR-0012) carries the defining invariant <em>no send to a suppressed
 * address</em>, enforced on both vehicles at the {@code application} chokepoint. The
 * <strong>booking-confirmation delivery log</strong> exists because the registry cannot answer the
 * question: {@code completion_date} records that the listener <em>returned</em>, equally true of a
 * suppression skip and of an abandonment, so both silent losses would read as "dispatched". What each
 * owns in detail: {@code RESPONSIBILITIES.md} §{@code notification}.
 *
 * <p>Hexagonal layout (invariant #11, ADR-0007 full template): {@code api} publishes two role-split
 * ports the edge calls — the fire-and-forget {@code MailSender} and the synchronous
 * {@code MailDeliverability} read; {@code application} holds the chokepoint service, the internal
 * transport/dispatch/suppression ports and the dispatcher; {@code adapter/in} the five registry
 * listeners plus the config that binds their properties; {@code adapter/out} the transports and the
 * suppression repository. No {@code domain} — table-backed state, but no aggregate yet.
 *
 * <p>The edge keeps deciding <em>when</em> to send and keeps all <strong>credential-material</strong>
 * machinery — minting a token, hashing it, setting its TTL, building the link that carries it
 * (RV-BE-11), so for the edge-triggered kinds this module is handed fully-formed links. The line that
 * rule always implied: {@code BookingLinks} formats {@code <base>/booking/<code>} <em>here</em>,
 * because the registry-borne mails are raised inside the hexagon with no edge flow to build anything,
 * and the arrival code cannot ride the payload, which the registry persists as text (invariant #7).
 * Formatting a fact already in hand mints nothing and hashes nothing.
 *
 * <p>The grants below are the five listeners' reads, least-privilege (#95) — no command surface, and
 * all five assemble the same facts through one shared resolver, so listeners were added without
 * widening them. {@code shared} is the OPEN kernel, granted for the admin adapter's {@code ApiProblem}
 * factory; it publishes no named interfaces, so its module root is the narrowest grant available.
 * {@code booking::spi} is the one <em>inbound</em> grant: {@code booking} declares
 * {@code ConfirmationMailDelivery} and this module implements it, so a confirmed booking's read model
 * can report a withheld mail without {@code booking} depending on {@code notification} — which would
 * cycle against the grants above it. Nothing depends on this module except the root.
 */
@org.springframework.modulith.ApplicationModule(
	displayName = "Notification",
	allowedDependencies = { "booking::api", "booking::events", "booking::spi", "booking::vocabulary",
			"customer::api", "customer::vocabulary", "venue::api", "venue::vocabulary", "shared" }
)
package ai.riviera.platform.notification;
