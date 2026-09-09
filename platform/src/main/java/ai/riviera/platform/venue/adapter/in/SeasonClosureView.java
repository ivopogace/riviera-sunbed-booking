package ai.riviera.platform.venue.adapter.in;

import ai.riviera.platform.venue.vocabulary.SeasonClosure;

/**
 * The owner profile's season-closure block: {@code closed} is the verdict at read time (a closure
 * whose reopen day has arrived reads open), {@code reopenOn} (ISO or {@code null}) and
 * {@code advanceSales} are the stored values. The tab keys on {@code closed} and never compares a
 * date with a clock.
 */
record SeasonClosureView(boolean closed, String reopenOn, boolean advanceSales) {

	static SeasonClosureView of(SeasonClosure closure, boolean closedForSeason) {
		return new SeasonClosureView(closedForSeason,
				closure.reopenOn() == null ? null : closure.reopenOn().toString(), closure.advanceSales());
	}
}
