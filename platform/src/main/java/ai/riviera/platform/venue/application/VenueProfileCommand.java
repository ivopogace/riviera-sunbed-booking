package ai.riviera.platform.venue.application;

import java.time.LocalTime;
import java.util.Set;

import ai.riviera.platform.venue.domain.SalesClose;
import ai.riviera.platform.venue.vocabulary.Amenity;

/**
 * The validated command to replace a venue's editable profile fields (O8, issue #177; widened from
 * the T7 #140 amenities + distance). It carries the operator-editable core —
 * {@code name}/{@code beach}/{@code region} (required text), {@code description} (optional),
 * {@code bookingMode} ({@code INSTANT}|{@code REQUEST}), {@code bookingCutoff} (a
 * {@code Europe/Tirane} wall-clock {@code LocalTime}, invariant #4/#6), {@code salesClose} (the
 * required three-value {@link SalesClose} choice) — plus the amenity set (an order-insensitive
 * subset of the fixed {@link Amenity} catalogue) and the optional distance-to-water in metres
 * ({@code null} = not stated).
 *
 * <p><strong>Commission and payout currency are intentionally NOT here.</strong> They are read-only
 * for operators (commission is the platform's cut — invariant #9; payout currency is a standing
 * provisional decision), so the write can never touch them: a crafted request has no field to set.
 *
 * <p>Catalogue membership is enforced by the {@link Amenity} type itself (the edge DTO parses codes
 * to {@code Amenity}), off-vocabulary sales closes by {@link SalesClose} likewise; the remaining
 * edge invariants are checked in the canonical constructor via {@link VenueFieldValidation}, shared
 * with {@link NewVenueCommand}. The amenity set is defensively copied so it is immutable and
 * order-insensitive.
 */
public record VenueProfileCommand(String name, String beach, String region, String description,
		String bookingMode, LocalTime bookingCutoff, SalesClose salesClose, Set<Amenity> amenities,
		Integer distanceToWaterM) {

	public VenueProfileCommand {
		VenueFieldValidation.requireText(name, "name");
		VenueFieldValidation.requireText(beach, "beach");
		VenueFieldValidation.requireText(region, "region");
		VenueFieldValidation.requireBookingMode(bookingMode);
		VenueFieldValidation.requireCutoff(bookingCutoff);
		VenueFieldValidation.requireSalesClose(salesClose);
		VenueFieldValidation.requirePositiveOrNullDistance(distanceToWaterM);
		amenities = amenities == null ? Set.of() : Set.copyOf(amenities);
	}
}
