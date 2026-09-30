package ai.riviera.platform.booking.application.request;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.availability.vocabulary.ClaimOutcome;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.application.reserve.ClaimRef;
import ai.riviera.platform.booking.application.reserve.SpanClaim;
import ai.riviera.platform.booking.events.BookingRequestDeclined;
import ai.riviera.platform.booking.events.StayRequestDeclined;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.DeclineReason;
import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.venue.vocabulary.StaySpan;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The committed half of the venue's accept (ADR-0025): claim every day of the pending request, or of
 * every stretch of a stay request (invariant #2, #1267), move it to {@code AWAITING_PAYMENT}, and decline
 * every pending request overlapping it, a stay whole — in one transaction, so the payment call that
 * follows holds no lock. A day that cannot be claimed makes the request decline itself whole. The accept locks
 * set rows by ascending day, then booking rows, as the reserve does; the revert, like the remodel, booking first.
 * Rationale: {@code RESPONSIBILITIES.md} §booking.
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
		declineRivals(List.of(span));
		return new AcceptClaim.Accepted(accepted.get());
	}

	/** {@link #accept} for a stay request: every stretch claimed and accepted, or none. */
	@Transactional
	public StayAcceptClaim acceptStay(StayId stayId, VenueId venueId, Instant now) {
		List<StayStretchRef> stretches = bookings.findPendingStayStretches(stayId, venueId);
		if (stretches.isEmpty()) {
			return new StayAcceptClaim.Missed();
		}
		List<StayStretchRef> won = new ArrayList<>();
		for (StayStretchRef stretch : stretches) {
			if (SpanClaim.claimEveryDay(availability, stretch.setId(), stretch.span()) != ClaimOutcome.CLAIMED) {
				won.forEach(held -> SpanClaim.releaseEveryDay(availability, held.setId(), held.span()));
				return declineStaySelf(stayId, venueId);
			}
			won.add(stretch);
		}
		List<AcceptedRequest> accepted = bookings.acceptPendingStay(stayId, venueId, now);
		if (accepted.isEmpty()) {
			won.forEach(held -> SpanClaim.releaseEveryDay(availability, held.setId(), held.span()));
			return new StayAcceptClaim.Missed();
		}
		if (accepted.size() != stretches.size()) {
			throw new IllegalStateException("stay " + stayId.value() + " accepted " + accepted.size() + " of "
					+ stretches.size() + " stretches");
		}
		declineRivals(stretches.stream()
				.map(stretch -> new ClaimRef(stretch.setId(), stretch.firstDay(), stretch.lastDay())).toList());
		return new StayAcceptClaim.Accepted(accepted);
	}

	/** Compensates a failed payment set-up: back to pending, releasing the claim it held (invariant #2, #1302). */
	@Transactional
	public boolean revert(AcceptedRequest accepted) {
		Optional<ClaimRef> held = bookings.revertAcceptToPending(accepted.bookingId());
		held.ifPresent(claim -> SpanClaim.releaseEveryDay(availability, claim.setId(),
				StaySpan.of(claim.bookingDate(), claim.lastDate())));
		return held.isPresent();
	}

	/**
	 * {@link #revert} for every stretch of an accepted stay request, in one transaction. A stay it cannot restore
	 * whole (a remodel released a stretch meanwhile) is declined {@code SET_UNAVAILABLE}, never left mixed (#1302).
	 */
	@Transactional
	public boolean revertStay(StayId stayId, List<AcceptedRequest> stretches) {
		int reverted = 0;
		for (AcceptedRequest stretch : stretches) {
			if (revert(stretch)) {
				reverted++;
			}
		}
		if (reverted > 0 && reverted < stretches.size()) {
			declineStaySelf(stayId, stretches.getFirst().venueId());
		}
		return reverted > 0;
	}

	/** Declines every pending request overlapping the accepted spans; one fact per lone rival and per rival stay. */
	private void declineRivals(List<ClaimRef> accepted) {
		Set<StayId> rivalStays = new LinkedHashSet<>();
		for (ClaimRef span : accepted) {
			for (DeclinedRival rival : bookings.declineRivals(span.setId(), span.bookingDate(), span.lastDate(),
					DeclineReason.ANOTHER_GUEST)) {
				if (rival.stayId() != null) {
					rivalStays.add(rival.stayId());
				}
				else {
					events.publishEvent(new BookingRequestDeclined(new BookingId(rival.bookingId()), rival.setId(),
							rival.bookingDate(), rival.lastDate(), DeclineReason.ANOTHER_GUEST));
				}
			}
		}
		rivalStays.forEach(stay -> events.publishEvent(new StayRequestDeclined(stay, DeclineReason.ANOTHER_GUEST)));
	}

	private AcceptClaim declineSelf(BookingId bookingId, VenueId venueId) {
		return bookings.declinePending(bookingId.value(), venueId, DeclineReason.SET_UNAVAILABLE)
				.<AcceptClaim>map(declined -> {
					events.publishEvent(new BookingRequestDeclined(bookingId, declined.setId(),
							declined.bookingDate(), declined.lastDate(), DeclineReason.SET_UNAVAILABLE));
					return new AcceptClaim.SetUnavailable();
				})
				.orElseGet(AcceptClaim.Missed::new);
	}

	private StayAcceptClaim declineStaySelf(StayId stayId, VenueId venueId) {
		if (!bookings.declinePendingStay(stayId, venueId, DeclineReason.SET_UNAVAILABLE)) {
			return new StayAcceptClaim.Missed();
		}
		events.publishEvent(new StayRequestDeclined(stayId, DeclineReason.SET_UNAVAILABLE));
		return new StayAcceptClaim.SetUnavailable();
	}
}
