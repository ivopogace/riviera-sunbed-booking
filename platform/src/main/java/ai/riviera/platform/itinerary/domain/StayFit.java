package ai.riviera.platform.itinerary.domain;

import java.time.LocalDate;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.StaySpan;

/**
 * The stay-fit rule (design D11/D13): a venue hosts a stay on one online set with no taken day in the
 * span, or with a plan of at most {@code maxMoves} moves ({@link ItinerarySearch}), within the venue's
 * maximum stay. Pure, so it lives in {@code domain} (ADR-0018): the caller hands in the venue's online
 * sets and each set's taken days (a set with none is absent), and only the span's own days count.
 * Walk-in sets never reach here (invariant #3).
 */
public final class StayFit {

	private StayFit() {
	}

	public static StayVerdict verdict(StaySpan span, Collection<SetId> onlineSets,
			Map<SetId, List<LocalDate>> takenDays, Integer maxStayDays, int maxMoves) {
		int sameSet = 0;
		int longestRun = 0;
		for (SetId set : onlineSets) {
			int run = longestFreeRun(span, takenDays.getOrDefault(set, List.of()));
			if (run == span.days()) {
				sameSet++;
			}
			longestRun = Math.max(longestRun, run);
		}
		boolean withinMaximum = maxStayDays == null || span.days() <= maxStayDays;
		if (!withinMaximum) {
			return new StayVerdict(StayVerdict.Fit.CANNOT_HOST, sameSet, longestRun, maxStayDays, 0);
		}
		if (sameSet > 0) {
			return new StayVerdict(StayVerdict.Fit.SAME_SET, sameSet, longestRun, maxStayDays, 0);
		}
		int run = longestRun;
		return ItinerarySearch.plan(span, List.copyOf(onlineSets), Map.of(), takenDays, maxMoves)
				.map(plan -> new StayVerdict(StayVerdict.Fit.FITS_WITH_MOVES, 0, run, maxStayDays, plan.moves()))
				.orElseGet(() -> new StayVerdict(StayVerdict.Fit.CANNOT_HOST, 0, run, maxStayDays, 0));
	}

	/** The most consecutive days of {@code span} not in {@code taken}; the whole span when none is. */
	public static int longestFreeRun(StaySpan span, Collection<LocalDate> taken) {
		Set<LocalDate> takenDays = new HashSet<>(taken);
		int longest = 0;
		int current = 0;
		for (LocalDate day : span.eachDay()) {
			current = takenDays.contains(day) ? 0 : current + 1;
			longest = Math.max(longest, current);
		}
		return longest;
	}
}
