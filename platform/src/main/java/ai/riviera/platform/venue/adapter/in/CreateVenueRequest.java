package ai.riviera.platform.venue.adapter.in;

import java.time.LocalTime;
import java.time.format.DateTimeParseException;

import ai.riviera.platform.venue.domain.SalesClose;
import ai.riviera.platform.venue.application.NewVenueCommand;

/**
 * The {@code POST /api/venues} request body (U7). A transport DTO of wire primitives;
 * {@link #toCommand()} maps it onto the typed {@link NewVenueCommand}, which validates ranges /
 * tokens / ISO currency. The project has no {@code spring-boot-starter-validation}, so presence
 * and shape are checked explicitly here and any bad input surfaces as {@link IllegalArgumentException}
 * (the controller maps it to {@code 400}).
 *
 * <p>Defaults at the slice: {@code payoutCurrency} defaults to {@code EUR} (per-venue ISO-4217,
 * decided at U7); {@code bookingCutoff} defaults to {@code 18:00} {@code Europe/Tirane}
 * (invariant #4); {@code salesClose} is optional — absent defaults to {@code 16:00}
 * ({@link SalesClose#DEFAULT}, via the command), present it must be one of the three fixed values.
 *
 * <p>{@code commissionBps} survives as a component solely to be refused: the platform sets the
 * commission (stamped server-side, adjusted only via the admin surface), so a body carrying any
 * value is rejected {@code 400} rather than silently overridden — a client must never believe it
 * chose a rate.
 */
record CreateVenueRequest(String name, String beach, String region, String description,
		String bookingMode, Integer commissionBps, String payoutCurrency, String bookingCutoff,
		String salesClose) {

	private static final String DEFAULT_PAYOUT_CURRENCY = "EUR";
	private static final LocalTime DEFAULT_CUTOFF = LocalTime.of(18, 0);

	NewVenueCommand toCommand() {
		if (commissionBps != null) {
			throw new IllegalArgumentException(
					"commissionBps is not accepted: the platform sets the commission rate");
		}
		String currency = (payoutCurrency == null || payoutCurrency.isBlank())
				? DEFAULT_PAYOUT_CURRENCY : payoutCurrency;
		return new NewVenueCommand(name, beach, region, description, bookingMode,
				currency, parseCutoff(bookingCutoff), parseSalesClose(salesClose));
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

	private static SalesClose parseSalesClose(String raw) {
		if (raw == null || raw.isBlank()) {
			return null; // absent → the command normalizes to SalesClose.DEFAULT
		}
		try {
			return SalesClose.fromTime(LocalTime.parse(raw));
		}
		catch (DateTimeParseException e) {
			// Same message as fromTime's: the caller learns the vocabulary, not the parse mechanics.
			throw new IllegalArgumentException("salesClose must be one of 00:01, 16:00, 23:59", e);
		}
	}
}
