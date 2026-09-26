package ai.riviera.platform.booking.vocabulary;

/**
 * Where a cancellation falls relative to its booking's service day, in {@code Europe/Tirane}
 * (invariants #6, #10): the <em>temporal</em> input {@code RefundPolicy} switches on, not the
 * reported {@code CancelOutcome.Tier} — a {@link #LATE} window at 0 bps reports {@code NONE}, and
 * {@link #CLOSED} reports no tier: it refuses the cancellation itself, since a stay the guest can
 * already be consuming is not reclaimable, so no refund is quoted or issued.
 * Rationale: ADR-0005.
 */
public enum CancellationWindow {

	/** Before the venue's evening-before cutoff — cancellation is free and refunds the full gross. */
	FREE,

	/** Cutoff passed, service day not yet open — the venue's late-cancel share applies. */
	LATE,

	/** The service day has opened — cancellation is refused and nothing is refundable. */
	CLOSED
}
