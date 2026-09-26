package ai.riviera.platform.booking.application.request;

import java.time.Instant;
import java.util.Optional;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.booking.events.BookingRequestDeclined;
import ai.riviera.platform.booking.events.BookingRequestExpired;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.application.reserve.ClaimRef;
import ai.riviera.platform.booking.domain.ServiceDays;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Terminates a pending request (decline, expire, or the guest's withdraw) and releases every day of its
 * span in one transaction, so no terminal booking keeps its set claimed (invariant #2). Each leg is a
 * guarded {@code UPDATE … RETURNING}; on an overdue row the row lock leaves one winner, every loser a
 * 0-row no-op. Keep this a separate bean: folded into its callers the transaction proxy is lost, and
 * the accept path must stay non-transactional around its Stripe call. The sweep calls {@link #expire}
 * once per row to isolate failures. Rationale: {@code RESPONSIBILITIES.md} §booking.
 */
@Service
class RequestReleaseService {

	private final Bookings bookings;
	private final AvailabilityClaim availability;
	private final ApplicationEventPublisher events;

	RequestReleaseService(Bookings bookings, AvailabilityClaim availability,
			ApplicationEventPublisher events) {
		this.bookings = bookings;
		this.availability = availability;
		this.events = events;
	}

	@Transactional
	public boolean decline(BookingId bookingId, VenueId venueId) {
		return bookings.declinePending(bookingId.value(), venueId)
				.map(claim -> {
					releaseSpan(claim);
					events.publishEvent(new BookingRequestDeclined(bookingId, claim.setId(),
							claim.bookingDate()));
					return true;
				})
				.orElse(false);
	}

	@Transactional
	public boolean expire(BookingId bookingId, Instant now) {
		return bookings.expirePendingRequest(bookingId.value(), now)
				.map(claim -> {
					releaseSpan(claim);
					events.publishEvent(new BookingRequestExpired(bookingId, claim.setId(),
							claim.bookingDate()));
					return true;
				})
				.orElse(false);
	}

	/**
	 * The guest's retraction, authorized by the booking code alone; returns the id so callers log that,
	 * never the code (invariant #7). Publishes no event on purpose
	 * ({@code RequestTerminationEventPublicationIT}).
	 */
	@Transactional
	public Optional<BookingId> withdraw(String code) {
		return bookings.withdrawPendingRequest(code)
				.map(withdrawn -> {
					releaseSpan(new ClaimRef(withdrawn.setId(), withdrawn.bookingDate(), withdrawn.lastDate()));
					return new BookingId(withdrawn.bookingId());
				});
	}

	/** Every day of the span, one {@code (set, date)} row each (invariant #2). */
	private void releaseSpan(ClaimRef claim) {
		for (var day : ServiceDays.between(claim.bookingDate(), claim.lastDate())) {
			availability.release(claim.setId(), day);
		}
	}
}
