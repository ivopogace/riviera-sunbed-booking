package ai.riviera.platform.booking.adapter.in;

/**
 * JSON view of one staff-daily-view row: the {@code setId} the booking holds, its {@code code}, and
 * its lifecycle {@code status} token ({@code CONFIRMED} | {@code COMPLETED} | {@code NO_SHOW}). The
 * code is the bearer credential staff verify on arrival (invariant #7) — returned over the
 * operator-gated endpoint by design, never logged in clear.
 */
record DailyBookingView(long setId, String code, String status) {
}
