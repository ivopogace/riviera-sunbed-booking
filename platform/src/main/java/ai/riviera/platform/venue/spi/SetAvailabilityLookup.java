package ai.riviera.platform.venue.spi;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;

import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * The live fact the static beach map lacks: which sets are <em>taken</em> on which days
 * (invariant #2). "Taken" means any {@code set_availability} row, {@code BOOKED_ONLINE} or
 * {@code STAFF_MARKED}; a set with no row is free. Days are {@code Europe/Tirane} (invariant #6).
 *
 * <p>Driven port implemented by {@code availability}, the sole owner of {@code set_availability};
 * inverted because {@code availability} already depends on {@code venue::api} (invariant #11).
 */
public interface SetAvailabilityLookup {

	/**
	 * The subset of {@code setIds} taken on {@code date}; free sets are absent. Never {@code null};
	 * an empty input yields an empty result without touching the database.
	 */
	Set<SetId> takenOn(Collection<SetId> setIds, LocalDate date);

	/**
	 * Whether any of {@code setIds} has a row dated {@code from} or later — the per-set layout-write
	 * guard, since {@code ON DELETE CASCADE} would silently drop the hold (invariant #2). An empty
	 * input yields {@code false} without a query. Rationale: RESPONSIBILITIES.md §venue.
	 */
	boolean anyClaimsFrom(Collection<SetId> setIds, LocalDate from);

	/**
	 * For each of {@code setIds} held on or after {@code from}, its earliest such day — the same
	 * predicate as {@link #anyClaimsFrom}, so a set absent here is one it would clear. Never
	 * {@code null}; an empty input yields an empty result without touching the database.
	 */
	Map<SetId, LocalDate> nearestClaimsFrom(Collection<SetId> setIds, LocalDate from);

	/**
	 * The state token ({@code BOOKED_ONLINE}/{@code STAFF_MARKED}) of each held set on {@code date};
	 * free sets absent, never {@code null}, empty input → empty result. Owner-asserted reads only: the
	 * public map uses {@link #takenOn}, so hold type never reaches a public surface.
	 */
	Map<SetId, String> statesOn(Collection<SetId> setIds, LocalDate date);

	/**
	 * Taken count per day in {@code [from, to]}, both pools; a day with none is <strong>absent</strong>,
	 * not zero. A snapshot, never a hold — {@code AvailabilityClaim} alone decides (invariant #2).
	 * Never {@code null}; an empty input yields an empty result without touching the database.
	 */
	Map<LocalDate, Integer> takenCountsBetween(Collection<SetId> setIds, LocalDate from, LocalDate to);

	/**
	 * The taken days in {@code [from, to]} per set, ascending; a set free on every day is absent. A
	 * snapshot, never a hold — {@code AvailabilityClaim} alone decides (invariant #2). Never
	 * {@code null}; an empty input yields an empty result without touching the database.
	 */
	Map<SetId, List<LocalDate>> takenDaysBetween(Collection<SetId> setIds, LocalDate from, LocalDate to);

	/**
	 * Per set, the days on or after {@code from} with a {@code STAFF_MARKED} hold, oldest first; a set
	 * with none is absent, never {@code null}, empty input → empty result. For the remodel preview: a
	 * walk-in can't be mailed, so its hold blocks the save.
	 */
	Map<SetId, List<LocalDate>> walkInHoldsFrom(Collection<SetId> setIds, LocalDate from);
}
