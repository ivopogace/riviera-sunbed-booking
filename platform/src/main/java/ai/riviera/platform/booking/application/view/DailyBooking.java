package ai.riviera.platform.booking.application.view;

import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * One row of the staff daily view (U8): which {@code set} a confirmed booking holds and its
 * {@code code} (the bearer credential, invariant #7) that staff verify on arrival. A thin value
 * carried out of {@link ListDailyBookings}; the {@code code} travels to the operator-gated endpoint
 * by design but is <strong>never logged</strong> in clear (invariant #7). Reused as the
 * {@code Bookings} read-port row shape — the data is identical and intra-module.
 */
public record DailyBooking(SetId setId, String code) {
}
