package ai.riviera.platform.booking.application.request;

import java.time.Instant;
import java.util.Optional;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.booking.events.BookingRequestDeclined;
import ai.riviera.platform.booking.events.BookingRequestExpired;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.DeclineReason;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Terminates a pending request (decline, expire, or the guest's withdraw): each leg is a guarded
 * {@code UPDATE … RETURNING} whose winner publishes the fact in the same transaction; a loser is a
 * 0-row no-op. A pending request holds no availability row, so no leg releases one (ADR-0025). Keep
 * this a separate bean: folded into its callers the transaction proxy is lost, and the accept path
 * stays non-transactional around its Stripe call. Rationale: {@code RESPONSIBILITIES.md} §booking.
 */
@Service
class RequestTerminationService {

	private final Bookings bookings;
	private final ApplicationEventPublisher events;

	RequestTerminationService(Bookings bookings, ApplicationEventPublisher events) {
		this.bookings = bookings;
		this.events = events;
	}

	/** The venue's own no. */
	@Transactional
	public boolean decline(BookingId bookingId, VenueId venueId) {
		return bookings.declinePending(bookingId.value(), venueId, DeclineReason.VENUE)
				.map(claim -> {
					events.publishEvent(new BookingRequestDeclined(bookingId, claim.setId(),
							claim.bookingDate(), DeclineReason.VENUE));
					return true;
				})
				.orElse(false);
	}

	@Transactional
	public boolean expire(BookingId bookingId, Instant now) {
		return bookings.expirePendingRequest(bookingId.value(), now)
				.map(claim -> {
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
				.map(withdrawn -> new BookingId(withdrawn.bookingId()));
	}
}
