package ai.riviera.platform.venue.spi;

import java.time.LocalDate;
import java.util.Collection;
import java.util.Map;
import java.util.Set;

import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * The one live fact the static beach map lacks: which of a set of positions are <em>taken</em>
 * on a given calendar day. Used by the {@code venue} read model (issue #44) to overlay
 * per-{@code (set, date)} availability (invariant #2) onto the layout it owns, so the map shows
 * the authoritative state for a chosen date rather than a date-less placeholder.
 *
 * <p><strong>Driven (SPI) port, dependency-inverted (invariant #11).</strong> It is declared
 * here, in the <em>consumer</em>'s {@code spi} named interface — the surface venue needs another
 * module to implement — and is <em>implemented by the {@code availability} module</em> (the sole
 * owner/reader of {@code set_availability}). The natural call direction —
 * {@code venue} asking {@code availability} — would create a Modulith cycle, because
 * {@code availability} already depends on {@code venue::api} (the claim's pool check). Inverting
 * it keeps the graph acyclic: {@code availability → venue} (now via {@code ::api} + {@code ::spi})
 * is the existing, allowed direction, and {@code venue} never imports {@code availability}.
 * {@code ModularityTests} is the gate. It lives in {@code spi}, not {@code api}, because it is an
 * "implement-me" port, not a "call-me" one (see {@code venue.spi} package docs and the
 * {@code riviera-modulith} skill's api-vs-spi rule).
 *
 * <p>"Taken" means any existing {@code set_availability} row for the date — {@code BOOKED_ONLINE}
 * today, {@code STAFF_MARKED} once staff tap-to-mark lands (U8) — mirroring the U2 model where
 * row-existence <em>is</em> the hold. A set with no row is free.
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
	 * Whether <strong>any</strong> of {@code setIds} has an availability row on <em>any</em> date. Used by
	 * the {@code venue} bulk-layout write (O3, issue #172) as the destructive-regenerate guard: because
	 * {@code set_availability.set_id} is {@code ON DELETE CASCADE}, deleting a claimed set would silently
	 * drop the hold (invariant #2), so a layout replace is refused when this returns {@code true}. Unlike
	 * {@link #takenOn}, it is date-agnostic — a hold on any day (a future walk-in mark, a past online hold)
	 * blocks the replace, matching the conservative reject-unless-unclaimed policy.
	 *
	 * @param setIds the set positions to probe (typically one venue's whole map)
	 * @return {@code true} if at least one has an availability row; an empty input yields {@code false}
	 *         without touching the database
	 */
	boolean anyClaims(Collection<SetId> setIds);

	/**
	 * The per-set availability <em>state</em> of the held subset of {@code setIds} on {@code date} —
	 * the state token ({@code BOOKED_ONLINE} or {@code STAFF_MARKED}) keyed by set id; a set with no
	 * availability row is simply absent (it is free). Unlike {@link #takenOn} this is deliberately
	 * state-aware: it feeds the <strong>owner-asserted operator</strong> daily read (issue #207), which
	 * must distinguish an online hold from a staff walk-in mark so an unpaid hold never renders as a
	 * walk-in. The tourist map keeps using the state-agnostic {@link #takenOn} — hold type never
	 * reaches the public surface.
	 *
	 * @param setIds the set positions to check (typically one venue's map)
	 * @param date   the calendar day, a {@code LocalDate} in {@code Europe/Tirane} (invariant #6)
	 * @return state token by set id for the held sets only; never {@code null}; an empty input yields
	 *         an empty result without touching the database
	 */
	Map<SetId, String> statesOn(Collection<SetId> setIds, LocalDate date);
}
