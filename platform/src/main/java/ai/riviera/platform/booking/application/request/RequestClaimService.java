package ai.riviera.platform.booking.application.request;

import java.time.Instant;
import java.util.Optional;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.availability.vocabulary.ClaimOutcome;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.application.reserve.ClaimRef;
import ai.riviera.platform.booking.application.reserve.SpanClaim;
import ai.riviera.platform.booking.events.BookingRequestDeclined;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.DeclineReason;
import ai.riviera.platform.venue.vocabulary.StaySpan;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The committed half of the venue's accept (ADR-0025): claim every day of the pending request
 * (invariant #2), move it to {@code AWAITING_PAYMENT}, and decline every other pending request that
 * overlaps it on that set — in one transaction, so the payment call that follows holds no lock. A day
 * that cannot be claimed makes the request decline itself. Lock order matches the reserve and the
 * remodel: the set's rows first, the booking row after. Rationale: {@code RESPONSIBILITIES.md} §booking.
 */
@Service
class RequestClaimService {

	private final Bookings bookings;
	private final AvailabilityClaim availability;
	private final ApplicationEventPublisher events;

	RequestClaimService(Bookings bookings, AvailabilityClaim availability, ApplicationEventPublisher events) {
		this.bookings = bookings;
		this.availability = availability;
		this.events = events;
	}

	@Transactional
	public AcceptClaim accept(BookingId bookingId, VenueId venueId, Instant now) {
		Optional<ClaimRef> pending = bookings.findPendingRequestSpan(bookingId.value(), venueId);
		if (pending.isEmpty()) {
			return new AcceptClaim.Missed();
		}
		ClaimRef span = pending.get();
		StaySpan days = StaySpan.of(span.bookingDate(), span.lastDate());
		if (SpanClaim.claimEveryDay(availability, span.setId(), days) != ClaimOutcome.CLAIMED) {
			return declineSelf(bookingId, venueId);
		}
		Optional<AcceptedRequest> accepted = bookings.acceptPendingRequest(bookingId.value(), venueId, now);
		if (accepted.isEmpty()) {
			SpanClaim.releaseEveryDay(availability, span.setId(), days);
			return new AcceptClaim.Missed();
		}
		for (DeclinedRival rival : bookings.declineOverlappingPending(span.setId(), span.bookingDate(),
				span.lastDate(), bookingId.value(), DeclineReason.ANOTHER_GUEST)) {
			events.publishEvent(new BookingRequestDeclined(new BookingId(rival.bookingId()), rival.setId(),
					rival.bookingDate(), DeclineReason.ANOTHER_GUEST));
		}
		return new AcceptClaim.Accepted(accepted.get());
	}

	/** Compensates a failed payment set-up: back to pending, and the accept's claim is given back. */
	@Transactional
	public boolean revert(AcceptedRequest accepted) {
		boolean reverted = bookings.revertAcceptToPending(accepted.bookingId());
		if (reverted) {
			SpanClaim.releaseEveryDay(availability, accepted.setId(),
					StaySpan.of(accepted.bookingDate(), accepted.lastDate()));
		}
		return reverted;
	}

	private AcceptClaim declineSelf(BookingId bookingId, VenueId venueId) {
		return bookings.declinePending(bookingId.value(), venueId, DeclineReason.SET_UNAVAILABLE)
				.<AcceptClaim>map(declined -> {
					events.publishEvent(new BookingRequestDeclined(bookingId, declined.setId(),
							declined.bookingDate(), DeclineReason.SET_UNAVAILABLE));
					return new AcceptClaim.SetUnavailable();
				})
				.orElseGet(AcceptClaim.Missed::new);
	}
}
