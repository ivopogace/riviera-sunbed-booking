package ai.riviera.platform.booking.application.request;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The one place a pending request is declined and its set freed (issue #98) — the request-slice
 * sibling of {@code ClaimReleaseService}: the guarded {@code PENDING_REQUEST → DECLINED}
 * transition ({@code UPDATE … RETURNING}) and the {@code availability.release} commit together,
 * so a booking is never left {@code DECLINED} with its set still claimed (invariant #2). The
 * {@code RETURNING} clause makes a lost race (a concurrent decline or the expiry sweep) a 0-row
 * no-op, so the set is released exactly once. The expiry sweep uses its own guarded transition
 * ({@code ExpireRequestsService}); the two guards are disjoint on status, never double-release.
 *
 * <p>A separate {@code @Transactional} bean (not a private method of
 * {@code RespondToRequestService}) so the transaction proxy is real — and the accept path stays
 * deliberately non-transactional around its Stripe call.
 */
@Service
class DeclineReleaseService {

	private final Bookings bookings;
	private final AvailabilityClaim availability;

	DeclineReleaseService(Bookings bookings, AvailabilityClaim availability) {
		this.bookings = bookings;
		this.availability = availability;
	}

	// public: proxy-based @Transactional only advises public methods (the class stays package-private).
	@Transactional
	public boolean decline(BookingId bookingId, VenueId venueId) {
		return bookings.declinePending(bookingId.value(), venueId)
				.map(claim -> {
					availability.release(claim.setId(), claim.bookingDate());
					return true;
				})
				.orElse(false);
	}
}
