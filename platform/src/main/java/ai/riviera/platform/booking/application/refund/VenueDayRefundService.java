package ai.riviera.platform.booking.application.refund;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.application.cancel.CancelledBooking;
import ai.riviera.platform.booking.domain.DayShare;
import ai.riviera.platform.booking.domain.ServiceDays;
import ai.riviera.platform.booking.events.BookingCancelled;
import ai.riviera.platform.booking.events.BookingDayRefunded;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The venue day refund, owner-asserted first (invariant #13), in one transaction: the weather refund's two
 * legs (ADR-0026) with reason {@code VENUE} and the actor stamped. A stay's day is refunded at its own rate
 * ({@link DayShare}) and its claim released unless the day is past — past is the no-show sweep's past,
 * before today in {@code Europe/Tirane} (#6) — so the set is sellable again (#2); a lone one-day booking is
 * cancelled and refunded in full whatever the cutoff (#10), its day freed. A lost race is classified off
 * the committed day, never retried. The refunds run after commit. Rationale: {@code RESPONSIBILITIES.md} §booking.
 */
@Service
class VenueDayRefundService implements RefundVenueDay {

	private static final Logger log = LoggerFactory.getLogger(VenueDayRefundService.class);
	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	private final Bookings bookings;
	private final AvailabilityClaim availability;
	private final ApplicationEventPublisher events;
	private final Clock clock;
	private final VenueOwnership ownership;

	VenueDayRefundService(Bookings bookings, AvailabilityClaim availability, ApplicationEventPublisher events,
			Clock clock, VenueOwnership ownership) {
		this.bookings = bookings;
		this.availability = availability;
		this.events = events;
		this.clock = clock;
		this.ownership = ownership;
	}

	@Override
	@Transactional
	public VenueDayRefundOutcome refundDay(OperatorId actor, VenueId venueId, String code, LocalDate day) {
		ownership.assertOwns(actor, new VenueRef(venueId.value()));
		Optional<RefundableBooking> found = bookings.findRefundableByCode(code, venueId, day);
		if (found.isEmpty()) {
			return new VenueDayRefundOutcome.NotFound();
		}
		RefundableBooking candidate = found.get();
		Optional<VenueDayRefundOutcome> refused = refusal(candidate);
		if (refused.isPresent()) {
			return refused.get();
		}
		Instant now = clock.instant();
		Optional<VenueDayRefundOutcome> done = candidate.isLoneOneDay()
				? cancelWhole(candidate, now)
				: refundStayDay(candidate, day, actor, now);
		done.ifPresent(outcome -> log.info("venue day refund by operator {} at venue {} on {}: booking {} → {}",
				actor.value(), venueId.value(), day, candidate.bookingId(), outcome));
		return done.orElseGet(() -> lostRace(code, venueId, day));
	}

	private static Optional<VenueDayRefundOutcome> refusal(RefundableBooking candidate) {
		if (candidate.dayAttended()) {
			return Optional.of(new VenueDayRefundOutcome.DayAttended());
		}
		if (candidate.dayRefunded()) {
			return Optional.of(new VenueDayRefundOutcome.DayAlreadyRefunded());
		}
		return Optional.empty();
	}

	/** The lone one-day leg (ADR-0027 §6): the weather refund's, with reason {@code VENUE}. */
	private Optional<VenueDayRefundOutcome> cancelWhole(RefundableBooking candidate, Instant now) {
		long refundMinor = candidate.amountMinor();
		Optional<CancelledBooking> transitioned = bookings.cancelByVenue(candidate.bookingId(), now, refundMinor,
				candidate.amountMinor(), RefundReason.VENUE);
		return transitioned.map(cancelled -> {
			for (LocalDate served : ServiceDays.held(cancelled.bookingDate(), cancelled.lastDate(),
					bookings.findReleasedDays(cancelled.id()))) {
				availability.release(cancelled.setId(), served);
			}
			events.publishEvent(new BookingCancelled(new BookingId(cancelled.id()), cancelled.venueId(),
					cancelled.setId(), cancelled.bookingDate(), refundMinor, cancelled.currency(),
					RefundReason.VENUE, cancelled.lastDate()));
			return new VenueDayRefundOutcome.BookingCancelled(refundMinor, cancelled.currency());
		});
	}

	/** The day leg (ADR-0027 §4): the day's own rate stamped with reason, actor and release, the claim freed unless past. */
	private Optional<VenueDayRefundOutcome> refundStayDay(RefundableBooking candidate, LocalDate day,
			OperatorId actor, Instant now) {
		boolean released = !day.isBefore(LocalDate.ofInstant(now, TIRANE));
		long refundMinor = DayShare.on(candidate.amountMinor(), candidate.bookingDate(), candidate.lastDate(), day);
		Optional<DayRefundedBooking> stamped = bookings.refundDay(candidate.bookingId(), day, refundMinor, now,
				DayRefundStamp.venue(actor, released));
		return stamped.map(refunded -> {
			if (released) {
				availability.release(refunded.setId(), day);
			}
			events.publishEvent(new BookingDayRefunded(new BookingId(refunded.id()), refunded.venueId(),
					refunded.setId(), day, refundMinor, refunded.currency(), refunded.stayId(), RefundReason.VENUE,
					released));
			return new VenueDayRefundOutcome.DayRefunded(refundMinor, refunded.currency(), released);
		});
	}

	/** The guarded write moved nothing: the committed day says which refusal a concurrent writer earned us. */
	private VenueDayRefundOutcome lostRace(String code, VenueId venueId, LocalDate day) {
		return bookings.findRefundableByCode(code, venueId, day)
				.flatMap(VenueDayRefundService::refusal)
				.orElseGet(VenueDayRefundOutcome.NotFound::new);
	}
}
