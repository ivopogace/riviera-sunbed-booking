package ai.riviera.platform.venue.application;

import java.time.LocalTime;

import ai.riviera.platform.venue.domain.SalesClose;
import ai.riviera.platform.venue.vocabulary.Beach;

/**
 * The validated intent to onboard a venue: the compact constructor enforces the domain rules
 * (shared with {@link VenueProfileCommand} via {@link VenueFieldValidation}); the DB CHECKs are
 * the backstop. {@code payoutCurrency} is ISO-4217; {@code bookingCutoff} a {@code Europe/Tirane}
 * local time (invariant #6); a {@code null} {@code salesClose} becomes {@link SalesClose#DEFAULT}
 * (16:00). No commission rate: it is the platform's term, stamped by the service from
 * {@link VenueCreationProperties}, so no driving adapter can supply one.
 */
public record NewVenueCommand(String name, Beach beach, String description,
		String bookingMode, String payoutCurrency, LocalTime bookingCutoff, SalesClose salesClose) {

	public NewVenueCommand {
		VenueFieldValidation.requireText(name, "name");
		VenueFieldValidation.requireBeach(beach);
		VenueFieldValidation.requireBookingMode(bookingMode);
		VenueFieldValidation.requireIsoCurrency(payoutCurrency, "payoutCurrency");
		VenueFieldValidation.requireCutoff(bookingCutoff);
		salesClose = salesClose == null ? SalesClose.DEFAULT : salesClose;
	}
}
