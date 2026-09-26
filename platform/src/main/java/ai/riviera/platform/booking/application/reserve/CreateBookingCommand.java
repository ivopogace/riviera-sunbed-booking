package ai.riviera.platform.booking.application.reserve;

import java.time.LocalDate;

import ai.riviera.platform.customer.vocabulary.GuestContact;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.StaySpan;

/**
 * The transport-agnostic intent to create an Instant booking: which set, for which days
 * ({@code bookingDate} the first, {@code lastDate} the last, inclusive — civil days in
 * {@code Europe/Tirane}, invariant #6), the guest's contact, and the optional account link. The
 * span is validated as a {@link StaySpan}: a last day before the first or a stay over
 * {@link StaySpan#MAX_DAYS} days is unrepresentable. {@code accountId} is <strong>nullable</strong>
 * (guest checkout); the contact is always present, so the {@link CustomerAccountId} is additive.
 */
public record CreateBookingCommand(SetId setId, LocalDate bookingDate, LocalDate lastDate,
		GuestContact contact, CustomerAccountId accountId) {

	public CreateBookingCommand {
		new StaySpan(bookingDate, lastDate);
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
