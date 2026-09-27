package ai.riviera.platform.booking.events;

import java.time.LocalDate;

import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.DeclineReason;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * A pending Request-to-Book ended {@code DECLINED} (the venue's no, a day the accept could not claim,
 * a set a remodel disturbed, or an overlapping request accepted instead — {@link DeclineReason}),
 * published inside the guarded transition's transaction; nothing was held, so nothing is released
 * (ADR-0025). Ids + the days only (invariant #11): {@code notification}, the sole subscriber,
 * re-reads the venue's name. Not a {@code BookingCancelled}: nothing accrued or was collected. Never
 * the code (invariant #7). Withdraw emits none: RESPONSIBILITIES.md §booking.
 */
public record BookingRequestDeclined(BookingId bookingId, SetId setId, LocalDate bookingDate,
		LocalDate lastDate, DeclineReason reason) {

	public BookingRequestDeclined(BookingId bookingId, SetId setId, LocalDate bookingDate, LocalDate lastDate) {
		this(bookingId, setId, bookingDate, lastDate, DeclineReason.VENUE);
	}

	/** The last service day; a payload serialized before {@code lastDate} existed is a one-day request. */
	public LocalDate lastDay() {
		return lastDate != null ? lastDate : bookingDate;
	}

	/** The reason; a payload serialized before {@code reason} existed is the venue's own decline. */
	public DeclineReason reasonOrVenue() {
		return reason != null ? reason : DeclineReason.VENUE;
	}
}
