package ai.riviera.platform.availability.api;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Map;

import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * The read port for a dated read model: which of a caller's sets are <em>taken</em> on which days
 * of a span (invariant #2). "Taken" is any {@code set_availability} row, whatever its state; a set
 * with no row is free. Days are {@code Europe/Tirane} (invariant #6). A snapshot, never a hold —
 * {@link AvailabilityClaim} alone decides. Rationale: RESPONSIBILITIES.md §availability.
 */
public interface SetAvailabilityFacts {

	/**
	 * The taken days in {@code [from, to]} per set, ascending; a set free on every day is absent.
	 * Never {@code null}; an empty input yields an empty result without touching the database.
	 */
	Map<SetId, List<LocalDate>> takenDaysBetween(Collection<SetId> setIds, LocalDate from, LocalDate to);
}
