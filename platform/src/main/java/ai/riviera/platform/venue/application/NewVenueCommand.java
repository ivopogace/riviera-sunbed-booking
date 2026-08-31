package ai.riviera.platform.venue.application;

import java.time.LocalTime;

import ai.riviera.platform.venue.domain.SalesClose;

/**
 * The validated intent to onboard a venue (U7). A typed command at the application boundary —
 * the REST adapter maps wire strings onto this; its compact constructor enforces the domain
 * invariants so an invalid command can never reach persistence (the DB CHECK constraints in V2
 * are the backstop, not the only guard). {@code payoutCurrency} is an ISO-4217 code (per-venue,
 * default EUR decided at the slice); {@code bookingCutoff} is a {@code Europe/Tirane} local time
 * (invariant #6); {@code salesClose} is the optional three-value {@link SalesClose} choice —
 * {@code null} normalizes to {@link SalesClose#DEFAULT} (16:00, the epic decision). Rating/reviews
 * are not operator input — a new venue starts at zero, and the commission rate is deliberately
 * absent: it is the platform's term, stamped by the application service from
 * {@link VenueCreationProperties}, so no driving adapter can supply one. The edge validators are
 * shared with {@link VenueProfileCommand} via {@link VenueFieldValidation}.
 */
public record NewVenueCommand(String name, String beach, String region, String description,
		String bookingMode, String payoutCurrency, LocalTime bookingCutoff, SalesClose salesClose) {

	public NewVenueCommand {
		VenueFieldValidation.requireText(name, "name");
		VenueFieldValidation.requireText(beach, "beach");
		VenueFieldValidation.requireText(region, "region");
		VenueFieldValidation.requireBookingMode(bookingMode);
		VenueFieldValidation.requireIsoCurrency(payoutCurrency, "payoutCurrency");
		VenueFieldValidation.requireCutoff(bookingCutoff);
		salesClose = salesClose == null ? SalesClose.DEFAULT : salesClose;
	}
}
