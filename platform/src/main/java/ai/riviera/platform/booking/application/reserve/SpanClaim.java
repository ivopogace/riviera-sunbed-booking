package ai.riviera.platform.booking.application.reserve;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.availability.vocabulary.ClaimOutcome;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.StaySpan;

/**
 * Claims one {@code (set, date)} row per day of a span (invariant #2), all or nothing: a day that
 * loses gives back every day already won, because a caller returning a value commits, and a claim
 * left behind would be a row nothing can identify. Shared by the Instant reserve and the request
 * accept (ADR-0025).
 */
public final class SpanClaim {

	private SpanClaim() {
	}

	/** {@code CLAIMED} iff every day was won; else the first losing day's outcome, with nothing held. */
	public static ClaimOutcome claimEveryDay(AvailabilityClaim availability, SetId setId, StaySpan stay) {
		List<LocalDate> won = new ArrayList<>();
		for (LocalDate day : stay.eachDay()) {
			ClaimOutcome outcome = availability.claim(setId, day);
			if (outcome != ClaimOutcome.CLAIMED) {
				won.forEach(held -> availability.release(setId, held));
				return outcome;
			}
			won.add(day);
		}
		return ClaimOutcome.CLAIMED;
	}

	/** Frees every day of the span, one row each. */
	public static void releaseEveryDay(AvailabilityClaim availability, SetId setId, StaySpan stay) {
		for (LocalDate day : stay.eachDay()) {
			availability.release(setId, day);
		}
	}
}
