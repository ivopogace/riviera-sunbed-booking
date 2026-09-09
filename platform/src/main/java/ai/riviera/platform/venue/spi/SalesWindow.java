package ai.riviera.platform.venue.spi;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;

import ai.riviera.platform.venue.vocabulary.SeasonClosure;

/**
 * Driven port: the open/closed verdict on a venue's online sales, as {@code booking} decides it.
 * Venue supplies its stored settings — the sales close and the season closure — and one
 * request-scoped instant; the implementor owns both rules and their boundary semantics
 * (invariant #4). Rationale: RESPONSIBILITIES.md §booking.
 */
public interface SalesWindow {

	/**
	 * Whether online sales for {@code bookingDate} are open at {@code now}: the season closure
	 * admits the date and the sales close on the day itself has not passed.
	 */
	boolean isOpen(LocalTime salesClose, SeasonClosure closure, LocalDate bookingDate, Instant now);

	/** Whether {@code closure} is still in effect at {@code now} — the "Closed for season" badge. */
	boolean closedForSeason(SeasonClosure closure, Instant now);
}
