package ai.riviera.platform.venue.spi;

import java.time.LocalDate;
import java.util.Collection;
import java.util.Set;

import ai.riviera.platform.venue.api.SetId;

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
}
