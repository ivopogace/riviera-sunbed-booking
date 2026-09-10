package ai.riviera.platform;

import java.util.List;

import ai.riviera.platform.venue.vocabulary.MoneyView;

/**
 * The remodel preview on the wire: the five groups the operator confirms against, {@code keep} — the
 * sets a blocked preview says to keep in this save (the blocking claims' and the staff holds' sets,
 * by id) — and {@code previewToken}, what the commit carries back to prove the operator confirmed
 * this picture. {@code feeTotal} is what the refunds in this picture would cost the venue at the
 * current rate, and each refund line carries the fee per booking. Dates are ISO {@code YYYY-MM-DD}
 * (invariant #6), amounts integer minor units (invariant #5), bookings by id and never by code
 * (invariant #7).
 */
record RemodelPreviewResponse(List<MoveView> moves, List<ClaimView> refunds, List<ReleaseView> releases,
		List<StaffHoldView> staffHolds, List<BlockView> blocks, List<SpotView> keep, String previewToken,
		MoneyView feeTotal) {

	record SpotView(long setId, String rowLabel, int positionNo) {
	}

	record MoveView(long bookingId, String bookingDate, MoneyView amount, SpotView from, SpotView to,
			int rowsAway, int positionsAway) {
	}

	/** {@code fee} is what the venue would pay for this refund, at the rate quoted with the picture. */
	record ClaimView(long bookingId, String bookingDate, MoneyView amount, SpotView from, MoneyView fee) {
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
