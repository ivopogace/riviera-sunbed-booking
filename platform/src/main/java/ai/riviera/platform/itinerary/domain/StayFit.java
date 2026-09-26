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
 * The stay-fit rule (design D11): a venue hosts a stay when one of its online sets has no taken day
 * in the span and the span is within the venue's maximum stay. Pure, so it lives in {@code domain}
 * (ADR-0018): the caller hands in the venue's online sets and each set's taken days (a set with none
 * is absent), and only the span's own days count. Walk-in sets never reach here (invariant #3).
 */
public final class StayFit {

	private StayFit() {
	}

	public static StayVerdict verdict(StaySpan span, Collection<SetId> onlineSets,
			Map<SetId, List<LocalDate>> takenDays, Integer maxStayDays) {
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
		StayVerdict.Fit fit = sameSet > 0 && withinMaximum ? StayVerdict.Fit.SAME_SET : StayVerdict.Fit.CANNOT_HOST;
		return new StayVerdict(fit, sameSet, longestRun, maxStayDays);
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
