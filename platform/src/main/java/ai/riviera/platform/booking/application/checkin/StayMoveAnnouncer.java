package ai.riviera.platform.booking.application.checkin;

import java.time.Instant;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.events.StayMoveDue;
import ai.riviera.platform.booking.vocabulary.BookingId;

/**
 * Stamps one arriving stretch and publishes {@link StayMoveDue} in the same transaction, so the stamp
 * and the registry row commit together: a loser of the guarded stamp publishes nothing. Public
 * {@code announce}, as {@code PaymentDueAnnouncer}: Spring's {@code @Transactional} proxy is
 * public-methods-only, and without it the reminder would publish outside any transaction.
 */
@Service
class StayMoveAnnouncer {

	private final Bookings bookings;
	private final ApplicationEventPublisher events;

	StayMoveAnnouncer(Bookings bookings, ApplicationEventPublisher events) {
		this.bookings = bookings;
		this.events = events;
	}

	@Transactional
	public boolean announce(BookingId bookingId, Instant now) {
		return bookings.stampMoveReminder(bookingId.value(), now)
				.map(move -> {
					events.publishEvent(new StayMoveDue(move.stayId(), move.bookingId(), move.moveDate()));
					return true;
				})
				.orElse(false);
	}
}
