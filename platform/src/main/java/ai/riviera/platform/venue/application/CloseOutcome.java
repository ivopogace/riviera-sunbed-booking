package ai.riviera.platform.venue.application;

import ai.riviera.platform.venue.vocabulary.LiveBookingCounts;
import ai.riviera.platform.venue.vocabulary.SeasonClosure;

/** The result of {@link CloseForSeason#close}: the closure now in force with its counts, or why not. */
public sealed interface CloseOutcome {

	record Closed(SeasonClosure closure, LiveBookingCounts counts) implements CloseOutcome {
	}

	record Rejected(SeasonClosureRejection reason) implements CloseOutcome {
	}
}
