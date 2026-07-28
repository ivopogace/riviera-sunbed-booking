package ai.riviera.platform.notification.application;

import java.time.Instant;

/**
 * What a reinstatement attempt found and did (#391) — a typed outcome, not an exception, because all
 * three cases are expected flows an admin acts on ({@code riviera-java-conventions} §6). Sealed, so
 * the driving adapter's {@code switch} is exhaustive without a {@code default}: a fourth case added
 * later fails compilation instead of falling through to a wrong HTTP response.
 *
 * <p>Each populated case carries the row's <strong>technical facts</strong> — never the address,
 * never the {@code domain}. That is what lets the reinstate response answer the investigative half of
 * the ops workflow ("what was this suppressed for, and since when?") without the slice growing a
 * standing suppression-lookup endpoint, which would be a new authenticated oracle for a question
 * #390 is careful not to expose pre-payment.
 *
 * <p>Timestamps are UTC instants (invariant #6). Module-internal: the only consumer is this module's
 * own {@code adapter/in}, so it stays in {@code application} rather than being published as
 * {@code vocabulary} (invariant #11 — publish a surface only when a sibling module needs it).
 */
public sealed interface ReinstateOutcome {

	/**
	 * The address was actively suppressed and is now mailable again; the fields describe the
	 * suppression that was just lifted.
	 */
	record Reinstated(SuppressionReason reason, Instant firstSuppressedAt, Instant lastEventAt)
			implements ReinstateOutcome {
	}

	/**
	 * The address is on the list but was already lifted — a no-op repeat, reporting the
	 * <em>original</em> {@code reinstatedAt} rather than moving it, so repeated calls are idempotent
	 * and the first lift stays the audit fact.
	 */
	record AlreadyReinstated(SuppressionReason reason, Instant firstSuppressedAt, Instant lastEventAt,
			Instant reinstatedAt) implements ReinstateOutcome {
	}

	/**
	 * The address is not on the list at all, so there was nothing to lift and nothing was written.
	 * Distinct from {@link AlreadyReinstated} on purpose: for an admin chasing "why did this tourist
	 * get no mail?", "never suppressed" and "suppressed, already cleared" point at different causes.
	 */
	record NotSuppressed() implements ReinstateOutcome {
	}
}
