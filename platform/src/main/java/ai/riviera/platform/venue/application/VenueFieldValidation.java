package ai.riviera.platform.venue.application;

import java.time.LocalTime;
import java.util.Arrays;
import java.util.Currency;
import java.util.Set;
import java.util.stream.Collectors;

import ai.riviera.platform.venue.vocabulary.BookingMode;

/**
 * Shared edge validators for the venue-profile fields, used by both {@link NewVenueCommand} (onboard,
 * U7) and {@link VenueProfileCommand} (edit, O8 #177) so the two command records enforce the same
 * invariants from one place — no duplicated validation block. Package-private, static-only; each
 * method throws {@link IllegalArgumentException} on a bad value, which the edge maps to
 * {@code 400 INVALID_REQUEST} (riviera-java-conventions §6b). The DB CHECK constraints (V2) remain
 * the race-safe backstop, not the only guard.
 */
final class VenueFieldValidation {

	/**
	 * The booking-mode tokens accepted on the wire — derived from the {@link BookingMode} enum (whose
	 * names are the same tokens the {@code venue_booking_mode_check} CHECK stores), so the validator, the
	 * enum, and the CHECK stay in one source of truth: a new mode added to the enum is accepted here too.
	 */
	static final Set<String> BOOKING_MODES =
			Arrays.stream(BookingMode.values()).map(Enum::name).collect(Collectors.toUnmodifiableSet());
	/** Commission bps upper bound (100%), mirroring the {@code venue_commission_bps_check} CHECK. */
	static final int MAX_BPS = 10_000;

	private VenueFieldValidation() {
	}

	static void requireText(String value, String field) {
		if (value == null || value.isBlank()) {
			throw new IllegalArgumentException(field + " is required");
		}
	}

	static void requireBookingMode(String mode) {
		if (!BOOKING_MODES.contains(mode)) {
			throw new IllegalArgumentException("bookingMode must be one of " + BOOKING_MODES);
		}
	}

	static void requireCutoff(LocalTime cutoff) {
		if (cutoff == null) {
			throw new IllegalArgumentException("bookingCutoff is required");
		}
	}

	static void requireCommissionBps(int commissionBps) {
		if (commissionBps < 0 || commissionBps > MAX_BPS) {
			throw new IllegalArgumentException("commissionBps must be between 0 and " + MAX_BPS);
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

	/** Positive-or-absent metres to water: {@code null} means "not stated". */
	static void requirePositiveOrNullDistance(Integer distanceToWaterM) {
		if (distanceToWaterM != null && distanceToWaterM <= 0) {
			throw new IllegalArgumentException("distanceToWaterM must be a positive integer");
		}
	}
}
