package ai.riviera.platform.booking.application.reserve;

import ai.riviera.platform.venue.vocabulary.SetBookingInfo;

/**
 * The result of the committed <em>reserve</em> phase of Instant-Book: either a persisted
 * {@code AWAITING_PAYMENT} booking already holding its {@code (set, date)} claim, or a rejection
 * that never touched the claim. {@link CreateBookingService} switches on this, then collects
 * payment <strong>after</strong> the reserve commit, so no claim row lock is held across the
 * Stripe call (rationale: RESPONSIBILITIES.md §booking). Package-private, sealed — not a
 * cross-module seam (invariant #11).
 */
sealed interface ReserveOutcome {

	/**
	 * The set was claimed (invariant #2) and the booking row inserted ({@code AWAITING_PAYMENT}),
	 * committed together. Carries the technical id + code and the {@link SetBookingInfo} the collect
	 * phase needs to build the {@code Money} and the confirmation view, plus the {@code customerId}
	 * the instant-confirm branch asks about the confirmation mail's deliverability — an id, so
	 * this module still never handles the guest's address — and the stay's total {@code amountMinor}
	 * in the set's currency (invariant #5), which is what the collect phase charges.
	 */
	record Reserved(long bookingId, String code, SetBookingInfo set,
			ai.riviera.platform.customer.vocabulary.CustomerId customerId, long amountMinor)
			implements ReserveOutcome {
	}

	/**
	 * Request-to-Book: the venue sells by request, so the row was inserted
	 * {@code PENDING_REQUEST} with its response deadline — the {@code (set, date)} is held
	 * (invariant #2) but there is <strong>no collect phase</strong>: no PaymentIntent exists
	 * until the venue accepts (payment-request-on-accept, riviera-stripe-payments).
	 */
	record RequestPending(long bookingId, String code, SetBookingInfo set,
			java.time.Instant requestExpiresAt, long amountMinor) implements ReserveOutcome {
	}

	/** Validation or the claim failed; nothing was persisted. Carries the create-level reason. */
	record Rejected(BookingOutcome.Rejected reason) implements ReserveOutcome {
	}
}
