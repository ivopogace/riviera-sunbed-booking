package ai.riviera.platform.booking.vocabulary;

/**
 * The gross online takings for one venue on one service date — the sum of a venue's
 * {@code CONFIRMED} online bookings' amounts for that {@code booking_date}, in integer minor
 * units + ISO currency (invariant #5). Published by the {@code booking} module's
 * {@link ai.riviera.platform.booking.api.DailyTakings} port and read by {@code payout} to apply
 * the venue's commission (the arithmetic stays in {@code payout}, invariant #9).
 *
 * <p>This is an <strong>indicative, per-service-date</strong> figure for the operator console's
 * "takings today" tile — deliberately independent of the payout ledger, which accrues per booking
 * by ISO-week of confirmation. An empty day is {@code (0, "EUR")}: v1 collection currency is EUR
 * (invariant #5), so {@code currency} is the venue's single booking currency, falling back to
 * {@code "EUR"} when there are no rows.
 */
public record OnlineTakings(long grossMinor, String currency) {
}
