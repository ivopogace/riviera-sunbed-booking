package ai.riviera.platform.booking.application.reserve;

import java.time.LocalDate;

import ai.riviera.platform.customer.vocabulary.GuestContact;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.StaySpan;
import ai.riviera.platform.shared.SiteLocale;
import java.util.Objects;

/**
 * The transport-agnostic intent to create an Instant booking: which set, for which days ({@code bookingDate}
 * to {@code lastDate} inclusive, {@code Europe/Tirane} civil days, invariant #6), the guest's contact, the
 * optional account link and the language every mail for it is written in. The span is a {@link StaySpan}: a
 * last day before the first or a stay over {@link StaySpan#MAX_DAYS} days is unrepresentable.
 * {@code accountId} is <strong>nullable</strong> (guest checkout); the contact is always present, so the
 * {@link CustomerAccountId} is additive.
 */
public record CreateBookingCommand(SetId setId, LocalDate bookingDate, LocalDate lastDate,
		GuestContact contact, CustomerAccountId accountId, SiteLocale locale) {

	public CreateBookingCommand {
		new StaySpan(bookingDate, lastDate);
		Objects.requireNonNull(locale, "locale");
	}

	/** In English, the source locale. */
	public CreateBookingCommand(SetId setId, LocalDate bookingDate, LocalDate lastDate, GuestContact contact,
			CustomerAccountId accountId) {
		this(setId, bookingDate, lastDate, contact, accountId, SiteLocale.EN);
	}

	/** Guest / signed-out checkout of one day: no account link. */
	public CreateBookingCommand(SetId setId, LocalDate bookingDate, GuestContact contact) {
		this(setId, bookingDate, bookingDate, contact, null);
	}

	/** One day, optionally linked to a signed-in account. */
	public CreateBookingCommand(SetId setId, LocalDate bookingDate, GuestContact contact,
			CustomerAccountId accountId) {
		this(setId, bookingDate, bookingDate, contact, accountId);
	}

	/** The days asked for, first to last. */
	public StaySpan stay() {
		return new StaySpan(bookingDate, lastDate);
	}
}
