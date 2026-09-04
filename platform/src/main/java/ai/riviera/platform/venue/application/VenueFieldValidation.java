package ai.riviera.platform.venue.application;

import java.time.LocalTime;
import java.util.Arrays;
import java.util.Currency;
import java.util.Set;
import java.util.stream.Collectors;

import ai.riviera.platform.venue.domain.SalesClose;
import ai.riviera.platform.venue.vocabulary.BookingMode;

/**
 * Shared edge validators for the venue's command records — {@link NewVenueCommand} (onboard, U7)
 * and {@link VenueProfileCommand} (edit) for the profile fields, {@link SetCommand} and
 * {@link RowPriceCommand} for the beach map — so records stating the same bound enforce it from
 * one place, never as a duplicated validation block. Package-private, static-only; each
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
	/** Row-label bound in code points, mirroring the V43 {@code set_position_row_label_check} CHECK. */
	static final int MAX_ROW_LABEL_LENGTH = 40;

	private VenueFieldValidation() {
	}

	/**
	 * Surrounding whitespace off a stored label, null-safe so the caller still reports a missing value
	 * rather than a NPE. Unicode-aware ({@code strip}, not {@code trim}), and applied before the length
	 * bound so padding cannot push a legal label over it.
	 */
	static String strip(String value) {
		return value == null ? null : value.strip();
	}

	static void requireText(String value, String field) {
		if (value == null || value.isBlank()) {
			throw new IllegalArgumentException(field + " is required");
		}
	}

	/** Bounded variant; code points match Postgres {@code char_length}, so the CHECK never fires first. */
	static void requireText(String value, String field, int maxLength) {
		requireText(value, field);
		if (value.codePointCount(0, value.length()) > maxLength) {
			throw new IllegalArgumentException(field + " must be at most " + maxLength + " characters");
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

	/** Presence only — off-vocabulary values are already unrepresentable in the {@link SalesClose} type. */
	static void requireSalesClose(SalesClose salesClose) {
		if (salesClose == null) {
			throw new IllegalArgumentException("salesClose is required");
		}
	}

	static void requireCommissionBps(int commissionBps) {
		if (commissionBps < 0 || commissionBps > MAX_BPS) {
			throw new IllegalArgumentException("commissionBps must be between 0 and " + MAX_BPS);
		}
	}

	/**
	 * Non-negative money bound on a minor-units amount (invariant #5) — zero is legal (a free row),
	 * so the bound is {@code >= 0}, mirroring the V2 {@code set_position_price_check} CHECK that
	 * stays the race-safe backstop.
	 */
	static void requireNonNegativeMinor(long amountMinor, String field) {
		if (amountMinor < 0) {
			throw new IllegalArgumentException(field + " must be >= 0");
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
