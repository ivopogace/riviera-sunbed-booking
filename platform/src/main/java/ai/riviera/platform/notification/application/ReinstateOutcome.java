package ai.riviera.platform.notification.application;

import java.time.Instant;

/**
 * What a reinstatement attempt found and did — typed, since all three cases are expected admin
 * flows; sealed, so the adapter's {@code switch} fails compilation on a fourth case instead of
 * falling through to a wrong HTTP response. Each populated case carries the row's technical facts,
 * never the address or {@code domain}, answering "suppressed for what, since when?" without a
 * standing lookup endpoint (a new suppression oracle). Timestamps are UTC instants (invariant #6).
 * Rationale: RESPONSIBILITIES.md §notification.
 */
public sealed interface ReinstateOutcome {

	/**
	 * The stable token for this outcome — <strong>one definition</strong> serving both the audit-log
	 * value and the wire {@code outcome} field, so the two can never drift and neither is a literal
	 * repeated at a call site ({@code riviera-java-conventions} §6a).
	 */
	default String code() {
		return switch (this) {
			case Reinstated ignored -> "REINSTATED";
			case AlreadyReinstated ignored -> "ALREADY_REINSTATED";
			case NotSuppressed ignored -> "NOT_SUPPRESSED";
		};
	}

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
