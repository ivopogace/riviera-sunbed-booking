package ai.riviera.platform.booking.application.request;

import java.time.Instant;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The one place a pending request is terminated and its set freed (issue #98) — the request-slice
 * sibling of {@code ClaimReleaseService}, with the two terminal legs side by side so they cannot
 * drift: <strong>decline</strong> (venue said no) and <strong>expire</strong> (venue never
 * answered). Each is a guarded {@code UPDATE … RETURNING} transition plus the
 * {@code availability.release}, committing together — a booking is never left
 * {@code DECLINED}/{@code EXPIRED} with its set still claimed (invariant #2), and the
 * {@code RETURNING} makes a lost race (concurrent decline, accept, or sweep) a 0-row no-op, so
 * the set is released exactly once. The guards are mutually exclusive by predicate.
 *
 * <p>A separate {@code @Transactional} bean (not private methods of the callers) so the
 * transaction proxy is real — the accept path stays deliberately non-transactional around its
 * Stripe call, and the sweep isolates failures per row by calling {@link #expire} once per
 * candidate. Methods public for the proxy; the class stays package-private.
 */
@Service
class RequestReleaseService {

	private final Bookings bookings;
	private final AvailabilityClaim availability;

	RequestReleaseService(Bookings bookings, AvailabilityClaim availability) {
		this.bookings = bookings;
		this.availability = availability;
	}

	@Transactional
	public boolean decline(BookingId bookingId, VenueId venueId) {
		return bookings.declinePending(bookingId.value(), venueId)
				.map(claim -> {
					availability.release(claim.setId(), claim.bookingDate());
					return true;
				})
				.orElse(false);
	}

	@Transactional
	public boolean expire(BookingId bookingId, Instant now) {
		return bookings.expirePendingRequest(bookingId.value(), now)
				.map(claim -> {
					availability.release(claim.setId(), claim.bookingDate());
					return true;
				})
				.orElse(false);
	}
}
