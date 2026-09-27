package ai.riviera.platform.booking.events;

import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.booking.vocabulary.StayId;

/**
 * Published once when a guest cancels a stitched stay whole, after every stretch's own
 * {@link BookingCancelled}; {@code notification} mails the stay once on it. Id-based: the code is read at
 * send time (invariant #7). {@code refundMinor} is the server's summed quote in minor units + ISO currency
 * (#5, #10); {@code reason} is {@code VENUE_CHANGE} only if every stretch was. Rationale: RESPONSIBILITIES.md §booking.
 */
public record StayCancelled(StayId stayId, long refundMinor, String currency, RefundReason reason) {
}
