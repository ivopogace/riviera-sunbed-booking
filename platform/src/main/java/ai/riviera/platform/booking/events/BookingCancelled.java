package ai.riviera.platform.booking.events;

import java.time.LocalDate;

import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.booking.vocabulary.StayId;

/**
 * Published when a booking becomes {@code CANCELLED}, save a remodel's nothing left (#1300). Id-based (#11);
 * days in {@code Europe/Tirane} (#6); {@code refundMinor} is the server's, minor units + ISO currency (#5, #10).
 * {@code payout} reverses in proportion and stamps {@code reason}; {@code notification} mails it; {@code booking}
 * refunds and voids.
 * {@code availability} and {@code payment} must never subscribe (a cycle). {@code cancelledWithStay} names
 * the stay that ended whole with it ({@link StayCancelled} mails it); null for one that ended on its own.
 */
public record BookingCancelled(BookingId bookingId, VenueId venueId, SetId setId,
		LocalDate bookingDate, long refundMinor, String currency, RefundReason reason, LocalDate lastDate,
		StayId cancelledWithStay) {

	/** A booking or stretch that ended on its own. */
	public BookingCancelled(BookingId bookingId, VenueId venueId, SetId setId, LocalDate bookingDate,
			long refundMinor, String currency, RefundReason reason, LocalDate lastDate) {
		this(bookingId, venueId, setId, bookingDate, refundMinor, currency, reason, lastDate, null);
	}

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
