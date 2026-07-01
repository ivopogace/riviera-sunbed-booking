package ai.riviera.platform.venue.application;

import java.time.LocalTime;
import java.util.Currency;
import java.util.Set;

/**
 * The validated intent to onboard a venue (U7). A typed command at the application boundary —
 * the REST adapter maps wire strings onto this; its compact constructor enforces the domain
 * invariants so an invalid command can never reach persistence (the DB CHECK constraints in V2
 * are the backstop, not the only guard). {@code commissionBps} is exact-integer basis points
 * (invariant #5, never a float); {@code payoutCurrency} is an ISO-4217 code (per-venue, default
 * EUR decided at the slice); {@code bookingCutoff} is a {@code Europe/Tirane} local time
 * (invariant #6). Rating/reviews are not operator input — a new venue starts at zero.
 */
public record NewVenueCommand(String name, String beach, String region, String description,
		String bookingMode, int commissionBps, String payoutCurrency, LocalTime bookingCutoff) {

	private static final Set<String> BOOKING_MODES = Set.of("INSTANT", "REQUEST");
	private static final int MAX_BPS = 10_000;

	public NewVenueCommand {
		requireText(name, "name");
		requireText(beach, "beach");
		requireText(region, "region");
		if (!BOOKING_MODES.contains(bookingMode)) {
			throw new IllegalArgumentException("bookingMode must be one of " + BOOKING_MODES);
		}
		if (commissionBps < 0 || commissionBps > MAX_BPS) {
			throw new IllegalArgumentException("commissionBps must be between 0 and " + MAX_BPS);
		}
		requireIsoCurrency(payoutCurrency, "payoutCurrency");
		if (bookingCutoff == null) {
			throw new IllegalArgumentException("bookingCutoff is required");
		}
	}

	static void requireText(String value, String field) {
		if (value == null || value.isBlank()) {
			throw new IllegalArgumentException(field + " is required");
		}
	}

	static void requireIsoCurrency(String code, String field) {
		if (code == null || code.isBlank()) {
			throw new IllegalArgumentException(field + " is required");
		}
		try {
			Currency.getInstance(code); // throws IllegalArgumentException for a non-ISO-4217 code
		}
		catch (IllegalArgumentException e) {
			throw new IllegalArgumentException(field + " must be an ISO-4217 currency code", e);
		}
	}
}
