package ai.riviera.platform.booking.events;

import java.time.LocalDate;

import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.RefundReason;

/**
 * Published when a booking becomes {@code CANCELLED}. Id-based (invariant #11); days are in
 * {@code Europe/Tirane} (#6); the server computes {@code refundMinor}, minor units + ISO currency
 * (#5, #10). {@code payout} reverses in proportion to it, stamps {@code reason} (a
 * {@code VENUE_CHANGE} adds a fee) and re-reads the accrual rather than carrying it here;
 * {@code notification} mails the record; {@code booking}'s own listeners refund and void a released
 * intent. {@code availability} and {@code payment} must never subscribe: an event back would cycle.
 */
public record BookingCancelled(BookingId bookingId, VenueId venueId, SetId setId,
		LocalDate bookingDate, long refundMinor, String currency, RefundReason reason, LocalDate lastDate) {

	/** A one-day booking: its last day is its first. */
	public BookingCancelled(BookingId bookingId, VenueId venueId, SetId setId, LocalDate bookingDate,
			long refundMinor, String currency, RefundReason reason) {
		this(bookingId, venueId, setId, bookingDate, refundMinor, currency, reason, bookingDate);
	}

	/** The last service day; a payload serialized before {@code lastDate} existed is a one-day booking. */
	public LocalDate lastDay() {
		return lastDate != null ? lastDate : bookingDate;
	}
}
