package ai.riviera.platform.venue.spi;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;

/**
 * Driven port: is a venue's online sales window for {@code bookingDate} open at {@code now}?
 * Venue supplies its stored sales-close and one request-scoped instant; the implementor owns
 * the rule and its boundary semantics (invariant #4). Rationale: RESPONSIBILITIES.md §booking.
 */
public interface SalesWindow {

	boolean isOpen(LocalTime salesClose, LocalDate bookingDate, Instant now);
}
