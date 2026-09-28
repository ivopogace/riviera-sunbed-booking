package ai.riviera.platform.venue.application;

import java.time.LocalDate;

import ai.riviera.platform.venue.vocabulary.BookedSpan;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * Why one set on the owner's beach map cannot be moved or removed right now: the span its live
 * bookings hold ({@code booked} — earliest first day to latest last day, any date) and the earliest
 * hold dated today or later ({@code heldOn}). Either may be {@code null}, never both — a set with
 * neither is free and absent from the read. Price, tier and pool stay editable on a locked set
 * (RESPONSIBILITIES.md §venue). Internal to the {@code venue} module (REST-only consumer), so it
 * lives in {@code application}, not {@code vocabulary}, like {@link SetDayState}.
 */
public record SetLock(SetId setId, BookedSpan booked, LocalDate heldOn) {

	public SetLock {
		if (booked == null && heldOn == null) {
			throw new IllegalArgumentException("a set lock names at least one live claim");
		}
	}
}
