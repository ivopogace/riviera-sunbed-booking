package ai.riviera.platform.notification.application;

import java.net.URI;
import java.time.LocalDate;

/**
 * Everything the "your request expired unanswered" email renders (#124) —
 * {@link RequestDeclinedMail}'s mirror for the sweep's fact, and every rule on that record applies
 * unchanged: a plain record only, no call-to-action, no amounts, the code-gated {@code statusLink}
 * built at send time, bearer credentials mailed and never logged (invariant #7).
 *
 * <p>A separate type rather than a shared "request closed" one, deliberately: the two mails say
 * different things ("the venue said no" vs "nobody answered" — {@code CONTEXT.md} keeps the
 * distinction), and {@code SentEmail}'s one-slot-per-kind rule exists so an IT asserting on one
 * kind can never silently match the other.
 */
public record RequestExpiredMail(String bookingCode, String venueName, LocalDate bookingDate,
		URI statusLink) {
}
