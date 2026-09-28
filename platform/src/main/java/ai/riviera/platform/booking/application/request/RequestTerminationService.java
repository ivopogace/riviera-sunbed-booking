package ai.riviera.platform.booking.application.request;

import java.time.Instant;
import java.util.Optional;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.booking.events.BookingRequestDeclined;
import ai.riviera.platform.booking.events.BookingRequestExpired;
import ai.riviera.platform.booking.events.StayRequestDeclined;
import ai.riviera.platform.booking.events.StayRequestExpired;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.DeclineReason;
import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.booking.application.reserve.ClaimRef;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Terminates a pending request, a stay request whole (decline, expire, the guest's withdraw): each leg is a guarded
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
							claim.bookingDate(), claim.lastDate(), DeclineReason.VENUE));
					return true;
				})
				.orElse(false);
	}

	/** The venue's own no to a stay request, whole (#1267); one fact for the stay. */
	@Transactional
	public boolean declineStay(StayId stayId, VenueId venueId) {
		if (!bookings.declinePendingStay(stayId, venueId, DeclineReason.VENUE)) {
			return false;
		}
		events.publishEvent(new StayRequestDeclined(stayId, DeclineReason.VENUE));
		return true;
	}

	/** Expires a lone request, or the whole stay request {@code bookingId} is a stretch of, publishing once. */
	@Transactional
	public boolean expire(BookingId bookingId, Instant now) {
		Optional<ClaimRef> lone = bookings.expirePendingRequest(bookingId.value(), now);
		if (lone.isPresent()) {
			events.publishEvent(new BookingRequestExpired(bookingId, lone.get().setId(),
					lone.get().bookingDate(), lone.get().lastDate()));
			return true;
		}
		Optional<StayId> stay = bookings.expirePendingStayOf(bookingId.value(), now);
		stay.ifPresent(expired -> events.publishEvent(new StayRequestExpired(expired)));
		return stay.isPresent();
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

	/** {@link #withdraw} of a stay request by the stay's code, whole (#1267); publishes nothing either. */
	@Transactional
	public Optional<StayId> withdrawStay(String code) {
		return bookings.withdrawPendingStay(code);
	}
}
