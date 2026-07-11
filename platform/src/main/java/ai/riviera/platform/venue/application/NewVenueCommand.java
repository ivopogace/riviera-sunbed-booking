package ai.riviera.platform.venue.application;

import java.time.LocalTime;

/**
 * The validated intent to onboard a venue (U7). A typed command at the application boundary —
 * the REST adapter maps wire strings onto this; its compact constructor enforces the domain
 * invariants so an invalid command can never reach persistence (the DB CHECK constraints in V2
 * are the backstop, not the only guard). {@code commissionBps} is exact-integer basis points
 * (invariant #5, never a float); {@code payoutCurrency} is an ISO-4217 code (per-venue, default
 * EUR decided at the slice); {@code bookingCutoff} is a {@code Europe/Tirane} local time
 * (invariant #6). Rating/reviews are not operator input — a new venue starts at zero. The edge
 * validators are shared with {@link VenueProfileCommand} via {@link VenueFieldValidation}.
 */
public record NewVenueCommand(String name, String beach, String region, String description,
		String bookingMode, int commissionBps, String payoutCurrency, LocalTime bookingCutoff) {

	public NewVenueCommand {
		VenueFieldValidation.requireText(name, "name");
		VenueFieldValidation.requireText(beach, "beach");
		VenueFieldValidation.requireText(region, "region");
		VenueFieldValidation.requireBookingMode(bookingMode);
		VenueFieldValidation.requireCommissionBps(commissionBps);
		VenueFieldValidation.requireIsoCurrency(payoutCurrency, "payoutCurrency");
		VenueFieldValidation.requireCutoff(bookingCutoff);
	}
}
