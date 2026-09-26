package ai.riviera.platform.booking.events;

import java.time.LocalDate;

import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Published when a remodel commit re-seats a live booking on another set of its venue, in the
 * transaction that also wrote the layout, availability rows and receipt. Code, price, status and
 * days are kept; {@code notification} resolves the code, labels, distance and free-exit deadline
 * via {@code booking.api} (the code never rides an event, invariant #7). Id-based payload
 * (invariant #11); days are {@code Europe/Tirane} (invariant #6). {@code lastDate} is {@code null}
 * on payloads serialized before it existed: read it through {@link #lastDay()}.
 */
public record BookingMoved(BookingId bookingId, VenueId venueId, SetId fromSetId, SetId toSetId,
		LocalDate bookingDate, LocalDate lastDate) {

	/** A one-day booking: its last day is its first. */
	public BookingMoved(BookingId bookingId, VenueId venueId, SetId fromSetId, SetId toSetId, LocalDate bookingDate) {
		this(bookingId, venueId, fromSetId, toSetId, bookingDate, bookingDate);
	}

	/** The last service day; a payload serialized before {@code lastDate} existed is a one-day booking. */
	public LocalDate lastDay() {
		return lastDate != null ? lastDate : bookingDate;
	}
}
