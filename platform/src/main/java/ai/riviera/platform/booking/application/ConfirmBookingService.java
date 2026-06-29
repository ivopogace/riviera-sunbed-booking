package ai.riviera.platform.booking.application;

import java.time.Instant;
import java.util.Optional;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.booking.api.BookingConfirmed;
import ai.riviera.platform.booking.api.BookingId;
import ai.riviera.platform.booking.application.in.ConfirmBooking;
import ai.riviera.platform.booking.application.out.Bookings;
import ai.riviera.platform.booking.application.out.ConfirmedBooking;

/**
 * The single confirm seam (invariant #11 event spine): transitions a booking to {@code CONFIRMED}
 * and publishes {@code BookingConfirmed} from one place, so both the stub path and the Stripe
 * webhook path announce the fact identically. {@code payout} accrues off this event (U5, issue #9).
 *
 * <p>Package-private {@code @Service} behind the {@link ConfirmBooking} port (the public seam,
 * invariant #11). {@code @Transactional} so the publish enrolls in the caller's transaction — the
 * Event Publication Registry persists the publication on commit and delivery is {@code AFTER_COMMIT}
 * to the async {@code payout} listener. The event payload is built from the facts the transition
 * {@code RETURNING}s, never from a second read (no race; correct for the webhook path, which holds
 * only a {@code bookingId}).
 */
@Service
class ConfirmBookingService implements ConfirmBooking {

	private final Bookings bookings;
	private final ApplicationEventPublisher events;

	ConfirmBookingService(Bookings bookings, ApplicationEventPublisher events) {
		this.bookings = bookings;
		this.events = events;
	}

	@Override
	@Transactional
	public void confirm(long bookingId, Instant confirmedAt) {
		publish(bookings.confirm(bookingId, confirmedAt));
	}

	@Override
	@Transactional
	public boolean confirmFromPayment(long bookingId, Instant confirmedAt) {
		Optional<ConfirmedBooking> confirmed = bookings.confirmFromPayment(bookingId, confirmedAt);
		confirmed.ifPresent(this::publish);
		return confirmed.isPresent();
	}

	private void publish(ConfirmedBooking c) {
		events.publishEvent(new BookingConfirmed(new BookingId(c.id()), c.venueId(), c.setId(),
				c.bookingDate(), c.amountMinor(), c.currency()));
	}
}
