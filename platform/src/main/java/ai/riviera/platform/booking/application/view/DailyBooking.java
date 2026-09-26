package ai.riviera.platform.booking.application.view;

import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * One row of the staff daily view (also the {@code Bookings} read-port row): which {@code set} the
 * booking holds, its {@code code} that staff verify on arrival, and its lifecycle {@code status} —
 * {@code CONFIRMED} (expected), {@code COMPLETED} (checked in) or {@code NO_SHOW} (the service day
 * passed unscanned), so a settled arrival stays listed rather than vanishing. The {@code code} is a
 * bearer credential (invariant #7): it travels to the operator-gated endpoint by design but is
 * <strong>never logged</strong> in clear.
 */
public record DailyBooking(SetId setId, String code, BookingStatus status) {
}
