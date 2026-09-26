package ai.riviera.platform.notification.application;

import java.net.URI;
import java.time.LocalDate;

/**
 * Everything the "your request expired unanswered" email renders —
 * {@link RequestDeclinedMail}'s mirror for the sweep's fact, and every rule on that record applies
 * unchanged: a plain record only, no call-to-action, no amounts, the code-gated {@code statusLink}
 * built at send time, bearer credentials mailed and never logged (invariant #7).
 *
 * <p>Separate on purpose: "the venue said no" and "nobody answered" differ ({@code CONTEXT.md});
 * {@code SentEmail}'s one-slot-per-kind rule keeps an IT on one kind from matching the other.
 */
public record RequestExpiredMail(String bookingCode, String venueName, LocalDate bookingDate,
		URI statusLink) {
}
