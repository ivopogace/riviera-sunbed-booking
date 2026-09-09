package ai.riviera.platform.booking.vocabulary;

import java.time.LocalDate;

/**
 * One live booking a remodel would disturb, with the {@link RemodelOutcome} decided for it: the
 * booking by id (never its code, invariant #7), the set it holds, its service date, its amount in
 * integer minor units (invariant #5) and the outcome.
 */
public record RemodelClaim(BookingId bookingId, SpotRef from, LocalDate bookingDate, long amountMinor,
		String currency, RemodelOutcome outcome) {
}
