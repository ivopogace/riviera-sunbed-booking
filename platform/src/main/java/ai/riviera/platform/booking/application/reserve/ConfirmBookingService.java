package ai.riviera.platform.booking.application.reserve;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.booking.events.BookingConfirmed;
import ai.riviera.platform.booking.events.StayConfirmed;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.application.cancel.CancellationPolicy;

/**
 * The single confirm seam behind {@link ConfirmBooking} (invariant #11): transitions a booking to
 * {@code CONFIRMED} and publishes {@code BookingConfirmed}, which {@code payout} accrues off, plus
 * {@code StayConfirmed} when that confirm leaves the booking's stay complete. {@code @Transactional} so
 * each publish enrolls in the transition's transaction (the registry persists it on commit). The payload
 * is built from the facts the transition {@code RETURNING}s, never from a second read.
 */
@Service
class ConfirmBookingService implements ConfirmBooking {

	private final Bookings bookings;
	private final ApplicationEventPublisher events;
	private final CancellationPolicy cancellationPolicy;

	ConfirmBookingService(Bookings bookings, ApplicationEventPublisher events,
			CancellationPolicy cancellationPolicy) {
		this.bookings = bookings;
		this.events = events;
		this.cancellationPolicy = cancellationPolicy;
	}

	@Override
	@Transactional
	public void confirm(long bookingId, Instant confirmedAt) {
		publish(bookings.confirm(bookingId, confirmedAt));
	}

	@Override
	@Transactional
	public void confirmAll(List<Long> bookingIds, Instant confirmedAt) {
		for (long bookingId : bookingIds) {
			publish(bookings.confirm(bookingId, confirmedAt));
		}
	}

	@Override
	@Transactional
	public boolean confirmFromPayment(long bookingId, Instant confirmedAt) {
		Optional<ConfirmedBooking> confirmed = bookings.confirmFromPayment(bookingId, confirmedAt);
		confirmed.ifPresent(this::publish);
		return confirmed.isPresent();
	}

	private void publish(ConfirmedBooking c) {
		// A missing set (an FK breach) must not fail the confirm: a null window means no disclosure.
		var birth = cancellationPolicy.windowAtBirth(c.setId(), c.bookingDate(), c.createdAt());
		events.publishEvent(new BookingConfirmed(new BookingId(c.id()), c.venueId(), c.setId(),
				c.bookingDate(), c.amountMinor(), c.currency(),
				birth.map(CancellationPolicy.BirthTerms::window).orElse(null),
				birth.map(CancellationPolicy.BirthTerms::lateCancelRefundBps).orElse(0), c.lastDate(), c.stayId()));
		if (c.stayId() != null) {
			bookings.lockConfirmedStay(c.stayId()).ifPresent(this::publish);
		}
	}

	private void publish(ConfirmedStay stay) {
		var birth = cancellationPolicy.windowAtBirth(stay.firstSetId(), stay.firstDate(), stay.createdAt());
		events.publishEvent(new StayConfirmed(stay.stayId(),
				birth.map(CancellationPolicy.BirthTerms::window).orElse(null),
				birth.map(CancellationPolicy.BirthTerms::lateCancelRefundBps).orElse(0)));
	}
}
