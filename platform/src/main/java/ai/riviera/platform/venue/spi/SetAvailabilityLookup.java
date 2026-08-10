package ai.riviera.platform.venue.spi;

import java.time.LocalDate;
import java.util.Collection;
import java.util.Map;
import java.util.Set;

import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * The one live fact the static beach map lacks: which of a set of positions are <em>taken</em> on a
 * given calendar day. Used by the {@code venue} read model to overlay per-{@code (set, date)}
 * availability (invariant #2) onto the layout it owns, so the map shows the authoritative state for a
 * chosen date rather than a date-less placeholder.
 *
 * <p><strong>Driven (SPI) port, dependency-inverted (invariant #11).</strong> Declared here, in the
 * <em>consumer</em>'s {@code spi} named interface, and <em>implemented by the {@code availability}
 * module</em> — the sole owner of {@code set_availability}. The natural call direction, {@code venue}
 * asking {@code availability}, would create a Modulith cycle, because {@code availability} already
 * depends on {@code venue::api} for the claim's pool check. Inverting it keeps the graph acyclic and
 * {@code venue} never imports {@code availability}; {@code ModularityTests} is the gate. It lives in
 * {@code spi} rather than {@code api} because it is an "implement-me" port, not a "call-me" one.
 *
 * <p>"Taken" means any existing {@code set_availability} row for the date — {@code BOOKED_ONLINE} or
 * {@code STAFF_MARKED} — mirroring the model where row-existence <em>is</em> the hold. A set with no
 * row is free.
 */
public interface SetAvailabilityLookup {

	/**
	 * The subset of {@code setIds} that are taken on {@code date}. Sets with no availability row
	 * are simply absent from the result (they are free). Never returns {@code null}; an empty
	 * input yields an empty result without touching the database.
	 *
	 * @param setIds the set positions to check (typically one venue's map)
	 * @param date   the calendar day, a {@code LocalDate} in {@code Europe/Tirane} (invariant #6)
	 * @return the ids of the taken sets, a (possibly empty) set
	 */
	Set<SetId> takenOn(Collection<SetId> setIds, LocalDate date);

	/**
	 * Whether any of {@code setIds} has an availability row dated {@code from} or later — the one
	 * availability question <strong>every</strong> layout write asks, whether it edits, removes, or
	 * regenerates. Because {@code set_availability.set_id} is {@code ON DELETE CASCADE}, a write
	 * that removes a held set would silently drop the hold (invariant #2), so it is refused while
	 * this returns {@code true}. A hold whose day has already passed can neither be stranded by
	 * moving the set nor meaningfully lost by deleting it, so it does not block.
	 * Rationale: RESPONSIBILITIES.md §venue.
	 *
	 * @param setIds the set positions to probe (one set, or one venue's whole map)
	 * @param from   the first day that still counts, a {@code LocalDate} in {@code Europe/Tirane}
	 *               (invariant #6)
	 * @return {@code true} if at least one has a row on or after {@code from}; an empty input
	 *         yields {@code false} without touching the database
	 */
	boolean anyClaimsFrom(Collection<SetId> setIds, LocalDate from);

	/**
	 * The per-set availability <em>state</em> of the held subset of {@code setIds} on {@code date} — the
	 * state token ({@code BOOKED_ONLINE} or {@code STAFF_MARKED}) keyed by set id; a set with no
	 * availability row is simply absent (it is free). Unlike {@link #takenOn} this is deliberately
	 * state-aware: it feeds the <strong>owner-asserted operator</strong> daily read, which must
	 * distinguish an online hold from a staff walk-in mark so an unpaid hold never renders as a walk-in.
	 * The tourist map keeps the state-agnostic {@link #takenOn} — hold type never reaches the public
	 * surface.
	 *
	 * @param setIds the set positions to check (typically one venue's map)
	 * @param date   the calendar day, a {@code LocalDate} in {@code Europe/Tirane} (invariant #6)
	 * @return state token by set id for the held sets only; never {@code null}; an empty input yields
	 *         an empty result without touching the database
	 */
	Map<SetId, String> statesOn(Collection<SetId> setIds, LocalDate date);
}
