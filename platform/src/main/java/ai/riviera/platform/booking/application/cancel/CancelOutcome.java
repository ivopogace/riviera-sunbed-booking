package ai.riviera.platform.booking.application.cancel;

import ai.riviera.platform.booking.domain.BookingStatus;

/**
 * The result of attempting a cancellation (U6) — a closed, caller-mappable set (typed outcomes for
 * expected flows, not exceptions, invariant idiom). The web adapter {@code switch}es exhaustively:
 * {@link Cancelled} → 200, {@link NotFound} → 404, {@link NotCancellable} and {@link WindowClosed}
 * → 409 under distinct codes.
 */
public sealed interface CancelOutcome permits CancelOutcome.Cancelled, CancelOutcome.NotFound,
		CancelOutcome.NotCancellable, CancelOutcome.WindowClosed {

	/**
	 * Cancelled. {@code refundMinor} is the server-computed refund issued (integer minor units +
	 * currency, invariants #5/#10); {@code tier} describes the policy outcome for display.
	 */
	record Cancelled(long refundMinor, String currency, Tier tier) implements CancelOutcome {
	}

	/** No booking has that code. */
	record NotFound() implements CancelOutcome {
	}

	/** The booking exists but is not in a cancellable ({@code CONFIRMED}) state. */
	record NotCancellable(BookingStatus currentStatus) implements CancelOutcome {
	}

	/**
	 * The booking is {@code CONFIRMED} but its service day has opened, so the stay is no longer
	 * reclaimable. Distinct from {@link NotCancellable} because the status is fine and only time
	 * has run out — collapsing the two would make a delivered booking indistinguishable from an
	 * already-cancelled one in the logs and on the wire.
	 */
	record WindowClosed() implements CancelOutcome {
	}

	/** The refund tier (invariant #10): full before the cutoff, partial or none after. */
	enum Tier {
		FULL,
		PARTIAL,
		NONE
	}
}
