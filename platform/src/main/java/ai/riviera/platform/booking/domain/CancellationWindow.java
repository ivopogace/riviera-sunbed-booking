package ai.riviera.platform.booking.domain;

/**
 * Where a cancellation request falls relative to its booking's service day, reasoned in
 * {@code Europe/Tirane} (invariants #4/#6). This is the <em>temporal</em> input {@link RefundPolicy}
 * switches on — not the reported outcome, which is {@code CancelOutcome.Tier} and does not
 * correspond one-to-one: a {@link #LATE} window at 0 bps reports {@code NONE}, and {@link #CLOSED}
 * reports no tier at all because the cancellation never happens.
 *
 * <p>{@link #CLOSED} is the one that also refuses the cancellation itself: a stay the guest can
 * already be consuming is not reclaimable, so no refund is quoted and none is issued.
 * Rationale: {@code docs/adr/0005-cancellation-refund-tiers-and-proportional-reversal.md}.
 */
public enum CancellationWindow {

	/** Before the venue's evening-before cutoff — cancellation is free and refunds the full gross. */
	FREE,

	/** Cutoff passed, service day not yet open — the venue's late-cancel share applies. */
	LATE,

	/** The service day has opened — cancellation is refused and nothing is refundable. */
	CLOSED
}
