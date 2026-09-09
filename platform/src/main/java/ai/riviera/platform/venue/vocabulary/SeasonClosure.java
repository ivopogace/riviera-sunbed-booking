package ai.riviera.platform.venue.vocabulary;

import java.time.LocalDate;

/**
 * A venue's closed-for-season state: {@code closed} with an optional {@code reopenOn} (a civil day
 * in {@code Europe/Tirane}, invariant #6) and the {@code advanceSales} opt-in that lets dates on or
 * after the reopen day sell while the venue is still shut. A closed venue stays visible and
 * unsellable — distinct from venue visibility, which hides it. The Java mirror of
 * {@code venue_season_closure_check} (V51): an open value carries neither field, and the opt-in
 * needs a reopen day, so an off-shape value is unrepresentable.
 *
 * <p>Whether a closure is still in effect at an instant, and which dates it admits, is
 * {@code booking}'s rule ({@code BookingCutoff}), reached through {@code venue.spi.SalesWindow};
 * this value carries the stored facts only. Rationale: RESPONSIBILITIES.md §venue.
 */
public record SeasonClosure(boolean closed, LocalDate reopenOn, boolean advanceSales) {

	private static final SeasonClosure OPEN = new SeasonClosure(false, null, false);

	public SeasonClosure {
		if (!closed && (reopenOn != null || advanceSales)) {
			throw new IllegalArgumentException("an open venue carries no reopen date and no advance-sales opt-in");
		}
		if (advanceSales && reopenOn == null) {
			throw new IllegalArgumentException("advance sales need a reopen date");
		}
	}

	/** The open state: no closure on record. */
	public static SeasonClosure open() {
		return OPEN;
	}

	/** A closure, with or without a reopen day; {@code advanceSales} needs one. */
	public static SeasonClosure closed(LocalDate reopenOn, boolean advanceSales) {
		return new SeasonClosure(true, reopenOn, advanceSales);
	}
}
