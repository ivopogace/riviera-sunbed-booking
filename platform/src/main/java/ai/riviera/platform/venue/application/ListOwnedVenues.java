package ai.riviera.platform.venue.application;

import java.util.List;

import ai.riviera.platform.operator.vocabulary.OperatorId;

/**
 * Driving port: "which venues does this operator own, and what are they called?" Module-internal
 * (its one caller is this module's {@code adapter.in}), so not in {@code api/} (invariant #11).
 * {@code venue} owns it, not {@code operator}: naming venues is this module's job, and the reverse
 * edge would cycle. Rationale: RESPONSIBILITIES.md §venue.
 */
public interface ListOwnedVenues {

	/**
	 * The venues {@code operator} owns ({@code operator_venue}, invariant #13) as picker summaries by
	 * name; empty, never {@code null}, when it owns none. Session-scoped by construction: no venue id
	 * in the request to tamper with, the mapping itself is the filter (BOLA-safe).
	 */
	List<OwnedVenueView> ownedBy(OperatorId operator);
}
