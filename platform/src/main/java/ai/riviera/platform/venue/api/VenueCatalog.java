package ai.riviera.platform.venue.api;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import ai.riviera.platform.venue.vocabulary.DailyAvailability;
import ai.riviera.platform.venue.vocabulary.StaySpan;
import ai.riviera.platform.venue.vocabulary.VenueFilter;
import ai.riviera.platform.venue.vocabulary.VenueId;
import ai.riviera.platform.venue.vocabulary.VenueMapView;
import ai.riviera.platform.venue.vocabulary.VenueSummaryView;

/**
 * The {@code venue} module's published tourist-read port (invariant #11): browsing venues and
 * rendering a venue's beach map. Tourist reads only — set facts live on {@link SetBookingFacts},
 * rates on {@link VenueRates}; add no sibling-facing method here ({@code VenueApiRoleSplitTests}).
 * All three reads fence tourist visibility: a venue whose owner is not {@code ACTIVE} is absent or
 * empty, indistinguishable from nonexistent. Rationale: RESPONSIBILITIES.md §venue.
 */
public interface VenueCatalog {

	/**
	 * The venue and its map for {@code stay} (Tirane civil days, invariant #6), or empty if absent or hidden.
	 * Each set is {@code FREE}, {@code TAKEN} or {@code PARTLY_FREE} off {@code set_availability} (#2);
	 * {@code salesOpen} is the first day's sales verdict with the season closure applied (#4).
	 */
	Optional<VenueMapView> findVenueMap(VenueId id, StaySpan stay);

	/**
	 * Summaries matching {@code filter} (both-null lists all; never {@code null}), each with its from-price
	 * (#5) and free/total count for {@code date} (Tirane, #6) off the same overlay as the map (#2).
	 * Ordered open venues first, then rating descending, then name ascending.
	 */
	List<VenueSummaryView> listVenues(VenueFilter filter, LocalDate date);

	/**
	 * Free/total per day of inclusive {@code [from, to]} (Europe/Tirane, #6), ascending and gap-filled, or
	 * empty if absent or hidden; {@code total} spans both pools (#3 applies at the claim). A snapshot, never a
	 * hold (#2). The caller bounds the window; an inverted one throws {@link IllegalArgumentException}.
	 */
	Optional<List<DailyAvailability>> availabilityBetween(VenueId id, LocalDate from, LocalDate to);
}
