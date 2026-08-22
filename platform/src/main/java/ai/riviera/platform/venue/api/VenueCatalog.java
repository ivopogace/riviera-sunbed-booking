package ai.riviera.platform.venue.api;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import ai.riviera.platform.venue.vocabulary.DailyAvailability;
import ai.riviera.platform.venue.vocabulary.VenueFilter;
import ai.riviera.platform.venue.vocabulary.VenueId;
import ai.riviera.platform.venue.vocabulary.VenueMapView;
import ai.riviera.platform.venue.vocabulary.VenueSummaryView;

/**
 * The {@code venue} module's published <strong>tourist-read</strong> port (invariant #11)
 * — browsing venues and rendering a venue's beach map. A deep module: this small interface
 * hides the SQL join, the from-price computation, and the view assembly. Consumed only by
 * the module's own REST adapter since the role split (issue #94): set facts live on
 * {@link SetBookingFacts}, rate configuration on {@link VenueRates} — do not add
 * sibling-facing methods here ({@code VenueApiRoleSplitTests} enforces this).
 *
 * <p>All three reads fence tourist visibility: a venue whose owning operator is not
 * {@code ACTIVE} is absent from the list and empty on the map and calendar reads,
 * indistinguishable from a venue that does not exist (the rule's one home:
 * {@code operator.api.VenueVisibility}).
 */
public interface VenueCatalog {

	/**
	 * The venue and its beach map for a given day, or empty if no venue has that id. Each set's
	 * {@code availability} reflects the authoritative {@code set_availability} state for
	 * {@code date} (invariant #2) — a set booked for that date renders {@code TAKEN}, otherwise
	 * {@code FREE} (issue #44).
	 *
	 * @param id   the venue
	 * @param date the calendar day to render availability for, a {@code LocalDate} in
	 *             {@code Europe/Tirane} (invariant #6)
	 */
	Optional<VenueMapView> findVenueMap(VenueId id, LocalDate date);

	/**
	 * The venues matching {@code filter}, as discovery summaries, for the tourist browse screen
	 * (issue #61, design §4.1 steps 1–2). Each summary carries the venue's "from" price (cheapest
	 * set, integer minor units, invariant #5) and its free/total set count for {@code date},
	 * sourced per-{@code (set, date)} from the authoritative availability table (invariant #2) —
	 * the same overlay {@link #findVenueMap} uses, so the count never disagrees with the map.
	 *
	 * <p>Results are ordered <strong>rating descending, then name ascending</strong> (best first,
	 * stable tie-break). A filter matching nothing yields an empty list, never {@code null}.
	 *
	 * @param filter the optional beach/region narrowing ({@link VenueFilter#of}); both-null lists all
	 * @param date   the calendar day to count availability for, a {@code LocalDate} in
	 *               {@code Europe/Tirane} (invariant #6)
	 */
	List<VenueSummaryView> listVenues(VenueFilter filter, LocalDate date);

	/**
	 * The venue's free/total set count for <em>each</em> day in {@code [from, to]} — the calendar
	 * read behind picking a date — or empty if no venue has that id or its owner is not
	 * {@code ACTIVE}. Every day in the inclusive window is present, ascending; a day nobody has
	 * touched reads {@code free == total}.
	 *
	 * <p>Counts come from the same {@code set_availability} state {@link #findVenueMap} overlays
	 * (invariant #2), so the calendar and the map cannot disagree about a day. Like the discovery
	 * card's count, {@code total} spans both pools; the online-pool restriction (invariant #3)
	 * applies later, at the map/claim.
	 *
	 * <p><strong>A snapshot, never a hold.</strong> A day reporting free capacity may be full by
	 * the time a claim is attempted — the claim decides, not this read — and it answers past days
	 * as readily as future ones: it reports availability, not bookability. The booking cutoff
	 * (invariant #4) stays enforced where it already is.
	 *
	 * @param id   the venue
	 * @param from the first day, inclusive, a {@code LocalDate} in {@code Europe/Tirane}
	 *             (invariant #6)
	 * @param to   the last day, inclusive; must not precede {@code from} (the caller bounds the
	 *             window — the REST edge caps it and rejects an inverted one)
	 */
	Optional<List<DailyAvailability>> availabilityBetween(VenueId id, LocalDate from, LocalDate to);
}
