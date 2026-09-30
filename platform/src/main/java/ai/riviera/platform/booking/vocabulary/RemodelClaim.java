package ai.riviera.platform.booking.vocabulary;

import java.time.LocalDate;

/**
 * One live booking a remodel would disturb, with the {@link RemodelOutcome} decided for it: the
 * booking by id (never its code, invariant #7), the set it holds, its span ({@code bookingDate} is
 * the first service day, {@code lastDate} the last, inclusive), the money still at stake in integer
 * minor units (the price less the days already refunded, #5, ADR-0026, ADR-0027) and the outcome: its
 * zone read on the first day, its move candidate free on every day.
 */
public record RemodelClaim(BookingId bookingId, SpotRef from, LocalDate bookingDate, LocalDate lastDate,
		long amountMinor, String currency, RemodelOutcome outcome) {
}
