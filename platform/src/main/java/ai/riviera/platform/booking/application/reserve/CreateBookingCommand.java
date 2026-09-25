package ai.riviera.platform.booking.application.reserve;

import java.time.LocalDate;

import ai.riviera.platform.customer.vocabulary.GuestContact;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.StaySpan;

/**
 * The intent to create an Instant booking: which set, for which days ({@code bookingDate} the first,
 * {@code lastDate} the last, inclusive — civil days in {@code Europe/Tirane}, invariant #6), the
 * guest's contact, and — when the tourist is signed in — the {@link CustomerAccountId} to link the
 * booking to. A transport-agnostic command — the web {@code CreateBookingRequest} maps onto it, so
 * the use case has no dependency on HTTP. The span is validated as a {@link StaySpan}: a last day
 * before the first or a stay over {@link StaySpan#MAX_DAYS} days is unrepresentable.
 *
 * <p>{@code accountId} is <strong>nullable</strong>: a guest / signed-out checkout carries no account
 * link. The guest contact is always present — a signed-in booking still needs the name/phone the
 * venue uses on arrival, so the account link is purely additive.
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
