package ai.riviera.platform.booking.application.in;

/**
 * The result of an admin weather refund (U9, issue #12): how many CONFIRMED bookings were cancelled
 * and fully refunded for the venue+date, and the total refunded in integer minor units + ISO currency
 * (invariant #5). A {@code refundedCount} of 0 (with {@code totalRefundedMinor} 0) means there were no
 * confirmed bookings for that day — a valid no-op, not an error.
 */
public record WeatherRefundOutcome(int refundedCount, long totalRefundedMinor, String currency) {
}
