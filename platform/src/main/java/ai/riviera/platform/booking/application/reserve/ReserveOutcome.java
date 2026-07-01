package ai.riviera.platform.booking.application.reserve;

import ai.riviera.platform.venue.vocabulary.SetBookingInfo;

/**
 * The result of the committed <em>reserve</em> phase of Instant-Book (issue #52): either a
 * persisted {@code AWAITING_PAYMENT} booking already holding its {@code (set, date)} claim, or a
 * rejection that never touched the claim. {@link CreateBookingService} switches on this, then
 * collects payment <strong>after</strong> the reserve transaction has committed — so the claim row
 * lock is never held across the Stripe network call (risk R-3).
 *
 * <p>Package-private, sealed — an internal value of the create orchestration, not a cross-module
 * seam (invariant #11; riviera-java-conventions: typed outcomes for expected flows).
 */
sealed interface ReserveOutcome {

	/**
	 * The set was claimed (invariant #2) and the booking row inserted ({@code AWAITING_PAYMENT}),
	 * committed together. Carries the technical id + code and the {@link SetBookingInfo} the collect
	 * phase needs to build the {@code Money} and the confirmation view.
	 */
	record Reserved(long bookingId, String code, SetBookingInfo set) implements ReserveOutcome {
	}

	/** Validation or the claim failed; nothing was persisted. Carries the create-level reason. */
	record Rejected(BookingOutcome.Rejected reason) implements ReserveOutcome {
	}
}
