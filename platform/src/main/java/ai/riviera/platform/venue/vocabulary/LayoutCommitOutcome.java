package ai.riviera.platform.venue.vocabulary;

import java.util.List;

/**
 * What {@code BeachMapRemodel#commit} did: the layout is written and the token advanced
 * ({@link Committed}); the caller's gate declined, nothing written ({@link Refused}); the save's own
 * probe still found a live claim on a disturbed set after the gate, nothing written
 * ({@link SetsInUse}); or the save's shape and token rejections ({@link Rejected}). Sealed so the
 * edge's switch is exhaustive.
 */
public sealed interface LayoutCommitOutcome
		permits LayoutCommitOutcome.Committed, LayoutCommitOutcome.Refused, LayoutCommitOutcome.SetsInUse,
		LayoutCommitOutcome.Rejected {

	enum Committed implements LayoutCommitOutcome { COMMITTED }

	enum Refused implements LayoutCommitOutcome { REFUSED }

	record SetsInUse(List<LockedSet> sets) implements LayoutCommitOutcome {
		public SetsInUse {
			sets = List.copyOf(sets);
		}
	}

	record Rejected(LayoutRejection reason) implements LayoutCommitOutcome {
	}
}
