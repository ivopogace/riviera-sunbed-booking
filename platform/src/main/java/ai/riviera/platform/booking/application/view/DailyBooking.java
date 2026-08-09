package ai.riviera.platform.booking.application.view;

import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * One row of the staff daily view: which {@code set} the booking holds, its {@code code} (the
 * bearer credential, invariant #7) that staff verify on arrival, and its lifecycle
 * {@code status} — {@code CONFIRMED} (expected), {@code COMPLETED} (checked in) or {@code NO_SHOW}
 * (the service day passed unscanned), so a settled arrival stays listed rather than vanishing.
 * The {@code code} travels to the operator-gated endpoint by design but is <strong>never
 * logged</strong> in clear. Reused as the {@code Bookings} read-port row shape — the data is
 * identical and intra-module.
 */
public record DailyBooking(SetId setId, String code, BookingStatus status) {
}
