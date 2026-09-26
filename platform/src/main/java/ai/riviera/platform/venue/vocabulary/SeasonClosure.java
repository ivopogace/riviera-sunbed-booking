package ai.riviera.platform.venue.vocabulary;

import java.time.LocalDate;

/**
 * A venue's closed-for-season state: {@code closed}, an optional {@code reopenOn} (a civil day in
 * {@code Europe/Tirane}, #6) and the {@code advanceSales} opt-in letting dates from the reopen day
 * sell while still shut. A closed venue stays visible but unsellable, unlike a hidden one. Mirrors
 * {@code venue_season_closure_check} (V51): open carries neither field; the opt-in needs a reopen
 * day. Whether a closure is in effect, and the dates it admits, is {@code booking}'s rule
 * ({@code BookingCutoff}) via {@code venue.spi.SalesWindow}. Rationale: RESPONSIBILITIES.md §venue.
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
