package ai.riviera.platform;

import java.util.List;

import ai.riviera.platform.venue.vocabulary.MoneyView;

/**
 * The remodel preview on the wire: the five groups the operator confirms against, and {@code keep}
 * — the sets a blocked preview says to keep in this save (the blocking claims' and the staff
 * holds' sets, by id). Dates are ISO {@code YYYY-MM-DD} (invariant #6), amounts integer minor units
 * (invariant #5), bookings by id and never by code (invariant #7).
 */
record RemodelPreviewResponse(List<MoveView> moves, List<ClaimView> refunds, List<ReleaseView> releases,
		List<StaffHoldView> staffHolds, List<BlockView> blocks, List<SpotView> keep) {

	record SpotView(long setId, String rowLabel, int positionNo) {
	}

	record MoveView(long bookingId, String bookingDate, MoneyView amount, SpotView from, SpotView to,
			int rowsAway, int positionsAway) {
	}

	record ClaimView(long bookingId, String bookingDate, MoneyView amount, SpotView from) {
	}

	/** {@code kind} is {@code RELEASE} for an unpaid booking, {@code DECLINE} for a pending request. */
	record ReleaseView(long bookingId, String bookingDate, MoneyView amount, SpotView from, String kind) {
	}

	record StaffHoldView(SpotView set, List<String> dates) {
	}

	/** {@code reason} is {@code FROZEN} or {@code NO_MOVE_CANDIDATE}; the set is in {@code keep}. */
	record BlockView(long bookingId, String bookingDate, MoneyView amount, SpotView from, String reason) {
	}
}
