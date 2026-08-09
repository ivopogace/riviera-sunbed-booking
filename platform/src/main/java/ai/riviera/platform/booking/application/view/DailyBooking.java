package ai.riviera.platform.booking.application.view;

import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * One row of the staff daily view (U8): which {@code set} the booking holds, its {@code code} (the
 * bearer credential, invariant #7) that staff verify on arrival, and — since #583 — whether the
 * guest is already {@code checkedIn} ({@code COMPLETED}), so a scanned arrival stays on the list
 * instead of vanishing. A thin value carried out of {@link ListDailyBookings}; the {@code code}
 * travels to the operator-gated endpoint by design but is <strong>never logged</strong> in clear
 * (invariant #7). Reused as the {@code Bookings} read-port row shape — the data is identical and
 * intra-module.
 */
public record DailyBooking(SetId setId, String code, boolean checkedIn) {
}
