package ai.riviera.platform.venue.adapter.in;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;

import ai.riviera.platform.venue.vocabulary.SeasonClosure;

/**
 * Request body for {@code PUT /api/venues/{venueId}/season-closure}: an optional ISO
 * {@code YYYY-MM-DD} reopen day (a civil day in {@code Europe/Tirane}, invariant #6) and the
 * advance-sales opt-in (absent reads {@code false}). The opt-in without a reopen day is malformed.
 */
record SeasonClosureRequest(String reopenOn, Boolean advanceSales) {

	/** The closed value to store; an unparseable day or an off-shape pair is an {@link IllegalArgumentException} (→ 400). */
	SeasonClosure toClosure() {
		return SeasonClosure.closed(parseReopenOn(), Boolean.TRUE.equals(advanceSales));
	}

	private LocalDate parseReopenOn() {
		if (reopenOn == null || reopenOn.isBlank()) {
			return null;
		}
		try {
			return LocalDate.parse(reopenOn);
		}
		catch (DateTimeParseException malformed) {
			throw new IllegalArgumentException("reopenOn must be an ISO date (YYYY-MM-DD)", malformed);
		}
	}
}
