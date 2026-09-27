package ai.riviera.platform.booking.events;

import java.time.LocalDate;

import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.StayId;

/**
 * Published once per move of a stitched stay, the evening before it (design D13), by the sweep that
 * stamped the arriving stretch; {@code notification} mails the reminder on it. {@code bookingId} is the
 * stretch the guest moves to on {@code moveDate} ({@code Europe/Tirane}, invariant #6). Id-based: the
 * code, both spots and the distance are read at send time (invariant #7). Rationale: RESPONSIBILITIES.md §booking.
 */
public record StayMoveDue(StayId stayId, BookingId bookingId, LocalDate moveDate) {
}
