package ai.riviera.platform.notification.application;

import java.net.URI;
import java.time.LocalDate;

/**
 * Everything the "the venue declined your request" email renders (#124) — structured rather than
 * pre-rendered, exactly as its booking siblings, so each {@link Mailer} decides its own
 * presentation.
 *
 * <p>A <strong>plain record only</strong>, by product decision (2026-08-01): the outcome, the
 * booking's facts, that nothing is held and nothing was charged, and {@code statusLink} — the
 * code-gated view, built at send time by {@link BookingLinks}, which renders the {@code DECLINED}
 * state. No call-to-action.
 *
 * <p>{@code bookingCode} is a bearer credential and {@code statusLink} embeds it (invariant #7):
 * mailing them is the point, logging them is not, and no transport reachable in production does.
 * No amount fields — a declined request never charged anything, and printing a price beside
 * "declined" would only invite the misreading that money moved. No spot, for
 * {@link PaymentDueMail}'s reason. Unpublished module-internal value (#382) — public only for the
 * module's own {@code adapter} packages.
 */
public record RequestDeclinedMail(String bookingCode, String venueName, LocalDate bookingDate,
		URI statusLink) {
}
