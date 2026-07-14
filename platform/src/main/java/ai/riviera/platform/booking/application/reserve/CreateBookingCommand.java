package ai.riviera.platform.booking.application.reserve;

import java.time.LocalDate;

import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.GuestContact;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * The intent to create an Instant booking: which set, for which calendar day (a
 * {@code LocalDate} reasoned in {@code Europe/Tirane}, invariant #6), the guest's contact, and —
 * when the tourist is signed in — the {@link CustomerAccountId} to link the booking to (S3, #114).
 * A transport-agnostic command — the web {@code CreateBookingRequest} maps onto it, so the use case
 * has no dependency on HTTP.
 *
 * <p>{@code accountId} is <strong>nullable</strong>: a guest / signed-out checkout carries no account
 * link (use the {@link #CreateBookingCommand(SetId, LocalDate, GuestContact) three-arg constructor}).
 * The guest contact is always present — a signed-in booking still needs the name/phone the venue uses
 * on arrival, so the account link is purely additive.
 */
public record CreateBookingCommand(SetId setId, LocalDate bookingDate, GuestContact contact,
		CustomerAccountId accountId) {

	/** Guest / signed-out checkout: no account link (an unchanged guest booking). */
	public CreateBookingCommand(SetId setId, LocalDate bookingDate, GuestContact contact) {
		this(setId, bookingDate, contact, null);
	}
}
