package ai.riviera.platform.booking.application.request;

/**
 * The closed set of outcomes of {@link WithdrawRequest#withdraw} — typed outcomes for
 * expected flows, not exceptions. The web adapter {@code switch}es exhaustively: {@link Withdrawn} →
 * 200, {@link Rejected#NO_SUCH_BOOKING} → 404, {@link Rejected#NOT_PENDING} → 409.
 *
 * <p>Like {@link DeclineOutcome} and unlike accept, there is no {@code EXPIRED} rejection: the
 * withdraw is deliberately not deadline-guarded, so an overdue-but-unswept request is withdrawable
 * rather than rejected — the same release, a different terminal label.
 */
public sealed interface WithdrawOutcome {

	/** The request is terminally {@code WITHDRAWN} and the {@code (set, date)} hold released. */
	record Withdrawn() implements WithdrawOutcome {
	}

	enum Rejected implements WithdrawOutcome {
		/** No booking has that code. */
		NO_SUCH_BOOKING,
		/** The booking exists but is not {@code PENDING_REQUEST} (already decided, paid, or terminal). */
		NOT_PENDING
	}
}
