package ai.riviera.platform.venue.adapter.in;

import ai.riviera.platform.venue.application.CloseOutcome;

/**
 * The close response: the closure now in force and what guests are still owed from today —
 * {@code futureBookings} a guest may still turn up on, {@code pendingRequests} the venue has not
 * answered. {@code reopenOn} is ISO {@code YYYY-MM-DD} or {@code null}.
 */
record SeasonClosureResponse(boolean closedForSeason, String reopenOn, boolean advanceSales,
		int futureBookings, int pendingRequests) {

	static SeasonClosureResponse of(CloseOutcome.Closed closed) {
		return new SeasonClosureResponse(true,
				closed.closure().reopenOn() == null ? null : closed.closure().reopenOn().toString(),
				closed.closure().advanceSales(),
				closed.counts().futureBookings(), closed.counts().pendingRequests());
	}
}
