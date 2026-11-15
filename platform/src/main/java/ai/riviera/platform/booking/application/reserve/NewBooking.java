package ai.riviera.platform.booking.application.reserve;

import java.time.LocalDate;

import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;
import ai.riviera.platform.shared.SiteLocale;

/**
 * The driven-port DTO to persist a brand-new booking row; cross-module references by typed id (invariant
 * #11). {@code code} is the unguessable credential (invariant #7); {@code bookingDate} to {@code lastDate} the
 * inclusive span of service days; the amount the total in integer minor units + currency (invariant #5).
 * {@code accountId} is <strong>nullable</strong>: the signed-in tourist's {@link CustomerAccountId} or
 * {@code null} for a guest, distinct from {@code customerId}, the guest-contact row. {@code locale} is the
 * guest's language, a stretch's its stay's.
 */
public record NewBooking(String code, VenueId venueId, SetId setId, CustomerId customerId,
		CustomerAccountId accountId, LocalDate bookingDate, LocalDate lastDate, long amountMinor,
		String amountCurrency, StayId stayId, SiteLocale locale) {

	/** A lone booking, no stay. */
	public NewBooking(String code, VenueId venueId, SetId setId, CustomerId customerId, CustomerAccountId accountId,
			LocalDate bookingDate, LocalDate lastDate, long amountMinor, String amountCurrency, SiteLocale locale) {
		this(code, venueId, setId, customerId, accountId, bookingDate, lastDate, amountMinor, amountCurrency, null,
				locale);
	}
}
