package ai.riviera.platform.venue.vocabulary;

import java.util.List;

/**
 * The dry run of a layout save: either the sets it would disturb — possibly none — or why it could
 * not be judged. A snapshot read under no lock; the save decides under its own.
 */
public sealed interface LayoutPreview permits LayoutPreview.Disturbing, LayoutPreview.Rejected {

	/** The removed and renumbered sets in stored-id order; empty when the save disturbs nobody. */
	record Disturbing(List<DisturbedSet> sets) implements LayoutPreview {
		public Disturbing {
			sets = List.copyOf(sets);
		}
	}

	record Rejected(PreviewRejection reason) implements LayoutPreview {
	}
}
