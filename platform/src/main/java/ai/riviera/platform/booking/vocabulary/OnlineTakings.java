package ai.riviera.platform.booking.vocabulary;

/**
 * The gross online takings for one venue on one service date: the sum of its {@code CONFIRMED},
 * {@code COMPLETED} and {@code NO_SHOW} bookings' amounts whose first day ({@code booking_date}) it
 * is, in minor units + ISO currency (invariant #5). Returned by
 * {@link ai.riviera.platform.booking.api.DailyTakings}; {@code payout} applies the commission
 * (invariant #9). An indicative "takings today" console figure, independent of the payout ledger
 * (Rationale: RESPONSIBILITIES.md §payout). An empty day is {@code (0, "EUR")}.
 */
public record OnlineTakings(long grossMinor, String currency) {
}
