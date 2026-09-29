package ai.riviera.platform.booking.events;

import java.time.LocalDate;

import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.booking.vocabulary.StayId;

/**
 * Published when one service day of a booking that happened is refunded and the booking stands (ADR-0026
 * for {@code WEATHER}, ADR-0027 for {@code VENUE}). Id-based (#11); {@code serviceDate} in {@code Europe/Tirane}
 * (#6); {@code refundMinor} is the day's rate the server decided (#5, #10); {@code released} is the stamp's fact,
 * never inferred from {@code reason}; {@code stayId} is null for a lone booking. {@code payout} posts the day's
 * reversal, {@code notification} mails it, {@code booking} refunds it; {@code availability} and {@code payment}
 * must never subscribe (a cycle).
 */
public record BookingDayRefunded(BookingId bookingId, VenueId venueId, SetId setId, LocalDate serviceDate,
		long refundMinor, String currency, StayId stayId, RefundReason reason, boolean released) {

	/** The reason; a payload serialized before {@code reason} existed is a weather refund's. */
	public RefundReason refundReason() {
		return reason != null ? reason : RefundReason.WEATHER;
	}
}
