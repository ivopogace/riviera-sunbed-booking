package ai.riviera.platform.venue.adapter.in;

import java.time.LocalTime;
import java.time.format.DateTimeParseException;

import ai.riviera.platform.venue.domain.SalesClose;
import ai.riviera.platform.venue.application.NewVenueCommand;

/**
 * The {@code POST /api/venues} body: {@link #toCommand()} maps it onto {@link NewVenueCommand}
 * (range, token, ISO-currency checks) via {@link BeachCode}. No bean validation: any bad input
 * is an {@link IllegalArgumentException}, the controller's {@code 400}. Defaults: payout
 * {@code EUR}, free-cancellation {@code bookingCutoff} {@code 18:00} {@code Europe/Tirane}, absent
 * {@code salesClose} → {@link SalesClose#DEFAULT}. Any {@code commissionBps} is a {@code 400},
 * never silently ignored: the platform sets the rate, and a client must never think it chose one.
 */
record CreateVenueRequest(String name, String beach, String description,
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
		return new NewVenueCommand(name, BeachCode.parse(beach), description, bookingMode,
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
