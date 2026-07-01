package ai.riviera.platform.venue.adapter.in;

import java.time.LocalTime;
import java.time.format.DateTimeParseException;

import ai.riviera.platform.venue.application.NewVenueCommand;

/**
 * The {@code POST /api/venues} request body (U7). A transport DTO of wire primitives;
 * {@link #toCommand()} maps it onto the typed {@link NewVenueCommand}, which validates ranges /
 * tokens / ISO currency. The project has no {@code spring-boot-starter-validation}, so presence
 * and shape are checked explicitly here and any bad input surfaces as {@link IllegalArgumentException}
 * (the controller maps it to {@code 400}).
 *
 * <p>Defaults at the slice: {@code payoutCurrency} defaults to {@code EUR} (per-venue ISO-4217,
 * decided at U7); {@code bookingCutoff} defaults to {@code 18:00} {@code Europe/Tirane} (invariant #4).
 */
record CreateVenueRequest(String name, String beach, String region, String description,
		String bookingMode, Integer commissionBps, String payoutCurrency, String bookingCutoff) {

	private static final String DEFAULT_PAYOUT_CURRENCY = "EUR";
	private static final LocalTime DEFAULT_CUTOFF = LocalTime.of(18, 0);

	NewVenueCommand toCommand() {
		if (commissionBps == null) {
			throw new IllegalArgumentException("commissionBps is required");
		}
		String currency = (payoutCurrency == null || payoutCurrency.isBlank())
				? DEFAULT_PAYOUT_CURRENCY : payoutCurrency;
		return new NewVenueCommand(name, beach, region, description, bookingMode, commissionBps,
				currency, parseCutoff(bookingCutoff));
	}

	private static LocalTime parseCutoff(String raw) {
		if (raw == null || raw.isBlank()) {
			return DEFAULT_CUTOFF;
		}
		try {
			return LocalTime.parse(raw); // ISO local time, e.g. "18:00"
		}
		catch (DateTimeParseException e) {
			throw new IllegalArgumentException("bookingCutoff must be a 24h local time (HH:mm)", e);
		}
	}
}
