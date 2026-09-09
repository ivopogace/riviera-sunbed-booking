package ai.riviera.platform.venue.application;

import java.time.LocalDate;

import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * Why one set on the owner's beach map cannot be moved or removed right now: the earliest date a
 * guest may still turn up on ({@code bookedOn}, a booking that can still be honoured — any date)
 * and the earliest hold dated today or later ({@code heldOn}). Either may be {@code null} when that
 * arm does not hold, never both null — a set with neither is free and absent from the read; a booked
 * set usually carries both, its own hold being the nearer. Price, tier and pool stay editable
 * on a locked set (RESPONSIBILITIES.md §venue). Internal to the {@code venue} module (REST-only
 * consumer), so it lives in {@code application}, not {@code vocabulary}, like {@link SetDayState}.
 */
public record SetLock(SetId setId, LocalDate bookedOn, LocalDate heldOn) {

	public SetLock {
		if (bookedOn == null && heldOn == null) {
			throw new IllegalArgumentException("a set lock names at least one live claim");
		}
	}
}
