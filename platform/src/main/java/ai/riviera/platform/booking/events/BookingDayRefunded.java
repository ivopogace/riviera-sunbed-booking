package ai.riviera.platform.booking.events;

import java.time.LocalDate;

import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.StayId;

/**
 * Published when one service day of a live booking is refunded for weather and the booking continues
 * (issue #1210, design D5). Id-based (#11); {@code serviceDate} in {@code Europe/Tirane} (#6);
 * {@code refundMinor} is the day's rate the server decided, minor units + ISO currency (#5, #10).
 * {@code payout} posts the day's reversal, {@code notification} mails it, {@code booking} refunds it.
 * {@code availability} and {@code payment} must never subscribe (a cycle). {@code stayId} is null for
 * a lone booking.
 */
public record BookingDayRefunded(BookingId bookingId, VenueId venueId, SetId setId, LocalDate serviceDate,
		long refundMinor, String currency, StayId stayId) {
}
