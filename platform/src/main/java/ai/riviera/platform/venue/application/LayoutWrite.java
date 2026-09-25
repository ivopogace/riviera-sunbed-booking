package ai.riviera.platform.venue.application;

import java.util.List;

import ai.riviera.platform.venue.vocabulary.LayoutRejection;

/**
 * What {@link LayoutWriter#write} did. {@link Written}: the diff is applied and the token advanced.
 * {@link Refused}: the caller's gate declined; nothing written. {@link KeptSetsDisplaced}: a
 * submitted set wants the stored row and position of a set the gate kept; nothing written.
 * {@link SetsInUse}: after the gate, the probe still found a live claim on a disturbed set; nothing
 * written. {@link Rejected}: the shape or token checks refused before any lock.
 */
sealed interface LayoutWrite permits LayoutWrite.Written, LayoutWrite.Refused, LayoutWrite.KeptSetsDisplaced,
		LayoutWrite.SetsInUse, LayoutWrite.Rejected {

	enum Written implements LayoutWrite { WRITTEN }

	enum Refused implements LayoutWrite { REFUSED }

	record KeptSetsDisplaced(List<PlacedSet> kept) implements LayoutWrite {
	}

	record SetsInUse(List<BlockedSet> sets) implements LayoutWrite {
	}

	record Rejected(LayoutRejection reason) implements LayoutWrite {
	}
}
