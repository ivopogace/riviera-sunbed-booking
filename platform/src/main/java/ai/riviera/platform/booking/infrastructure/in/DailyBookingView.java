package ai.riviera.platform.booking.infrastructure.in;

/**
 * JSON view of one staff-daily-view row (U8): the {@code setId} the booking holds and its
 * {@code code}. The code is the bearer credential staff verify on arrival (invariant #7) — returned
 * over the operator-gated endpoint by design, never logged in clear.
 */
record DailyBookingView(long setId, String code) {
}
