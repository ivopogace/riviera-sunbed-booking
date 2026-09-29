package ai.riviera.platform.booking.application.refund;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Optional;
import java.util.function.Supplier;

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
 * The venue day refund in one transaction: the operator's entry owner-asserted first (#13), the admin's keyed
 * on the booking id with no ownership (ADR-0027 decision 1); both take the weather refund's legs (ADR-0026)
 * with reason {@code VENUE} and the actor stamped. A stay's day is refunded at its own rate ({@link DayShare})
 * and released unless past (before today in {@code Europe/Tirane}, the sweep's past, #6), so the set sells
 * again (#2); a lone one-day booking is cancelled in full whatever the cutoff (#10). A lost race is classified
 * off the committed day; the refunds run after commit. Rationale: {@code RESPONSIBILITIES.md} §booking.
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
		Supplier<Optional<RefundableBooking>> candidate = () -> bookings.findRefundableByCode(code, venueId, day);
		return refund(candidate, actor, day, "operator " + actor.value() + " at venue " + venueId.value());
	}

	@Override
	@Transactional
	public VenueDayRefundOutcome refundDayAsAdmin(OperatorId admin, BookingId bookingId, LocalDate day) {
		Supplier<Optional<RefundableBooking>> candidate = () -> bookings.findRefundableById(bookingId.value(), day);
		return refund(candidate, admin, day, "admin " + admin.value());
	}

	/** Both gates' shared body: {@code candidate} is re-read to classify a lost race off the committed day. */
	private VenueDayRefundOutcome refund(Supplier<Optional<RefundableBooking>> candidate, OperatorId actor,
			LocalDate day, String actorLabel) {
		Optional<RefundableBooking> found = candidate.get();
		if (found.isEmpty()) {
			return new VenueDayRefundOutcome.NotFound();
		}
		RefundableBooking booking = found.get();
		Optional<VenueDayRefundOutcome> refused = refusal(booking);
		if (refused.isPresent()) {
			return refused.get();
		}
		Instant now = clock.instant();
		Optional<VenueDayRefundOutcome> done = booking.isLoneOneDay()
				? cancelWhole(booking, actor, now)
				: refundStayDay(booking, day, actor, now);
		done.ifPresent(outcome -> log.info("venue day refund by {} on {}: booking {} → {}", actorLabel, day,
				booking.bookingId(), outcome));
		return done.orElseGet(() -> candidate.get().flatMap(VenueDayRefundService::refusal)
				.orElseGet(VenueDayRefundOutcome.NotFound::new));
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

	/** The lone one-day leg (ADR-0027 §6): the weather refund's, with reason {@code VENUE} and the actor on its day. */
	private Optional<VenueDayRefundOutcome> cancelWhole(RefundableBooking candidate, OperatorId actor, Instant now) {
		long refundMinor = candidate.amountMinor();
		Optional<CancelledBooking> transitioned = bookings.cancelByVenue(candidate.bookingId(), now, refundMinor,
				candidate.amountMinor(), RefundReason.VENUE, actor);
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
}
