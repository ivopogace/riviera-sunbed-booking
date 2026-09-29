package ai.riviera.platform.booking.application.refund;

/**
 * What a venue day refund did — a closed set the adapter switches over exhaustively; expected outcomes
 * (an attended day, a replay, an unknown code) are values, not exceptions. Money is integer minor units +
 * ISO currency (invariant #5); none carries the booking code (invariant #7).
 */
public sealed interface VenueDayRefundOutcome {

	/** A stay's day refunded at its own rate, the stay going on; {@code released} iff its claim was freed (a non-past day). */
	record DayRefunded(long refundMinor, String currency, boolean released) implements VenueDayRefundOutcome {
	}

	/** A lone one-day booking cancelled whole, refunded in full whatever the cutoff, its day released. */
	record BookingCancelled(long refundMinor, String currency) implements VenueDayRefundOutcome {
	}

	/** The guest checked into the day: never refunded here (ADR-0027 §7). */
	record DayAttended() implements VenueDayRefundOutcome {
	}

	/** The day was already refunded (a replay, a weather day, or a concurrent refund that won). */
	record DayAlreadyRefunded() implements VenueDayRefundOutcome {
	}

	/** No booking that happened covers this day behind this code at this venue — unknown, foreign and dead alike. */
	record NotFound() implements VenueDayRefundOutcome {
	}
}
