package ai.riviera.platform.venue.vocabulary;

import java.util.List;

/**
 * What a {@code RemodelGate} answers: write the layout, leaving the {@link Proceed#kept} sets
 * exactly as stored — neither removed, renumbered nor otherwise updated, and never probed for a live
 * claim, since the caller settled around them — or write nothing ({@link Decline}). A kept id that
 * names no disturbed set is ignored. Sealed so the writer's switch is exhaustive.
 */
public sealed interface GateVerdict permits GateVerdict.Proceed, GateVerdict.Decline {

	/** Proceed with nothing kept: every disturbed set is written as submitted. */
	static GateVerdict proceed() {
		return new Proceed(List.of());
	}

	record Proceed(List<SetId> kept) implements GateVerdict {
		public Proceed {
			kept = List.copyOf(kept);
		}
	}

	enum Decline implements GateVerdict { DECLINED }
}
