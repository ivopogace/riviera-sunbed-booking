package ai.riviera.platform.booking.application.out;

/**
 * A {@code CONFIRMED} booking eligible for the admin weather refund (U9, issue #12): its id and the
 * gross {@code amountMinor} paid (integer minor units, invariant #5). Read by
 * {@link Bookings#findConfirmedForWeatherRefund} so {@code WeatherRefundService} knows the
 * <strong>full</strong> amount to refund per booking; the remaining cancellation facts come back from
 * the guarded {@link Bookings#cancelConfirmed} transition ({@link CancelledBooking}). A thin read row,
 * not the aggregate.
 */
public record RefundableBooking(long bookingId, long amountMinor) {
}
