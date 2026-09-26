package ai.riviera.platform.booking.application.reserve;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.application.refund.ReleaseAbandonedBooking;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.domain.ServiceDays;

/**
 * The one place an unpaid booking is cancelled and every day of its set freed, implementing
 * {@link ReleaseAbandonedBooking} for both the {@code payment_intent.canceled} webhook listener and
 * the abandoned-payment TTL sweep, so no forked copy can drift or double-act.
 * {@code @Transactional}: the guarded {@code cancelAwaitingPayment} and the release commit
 * together, so a booking is never left {@code CANCELLED} with its set still claimed (invariant #2);
 * {@code RETURNING} makes a lost race or re-delivery a 0-row no-op. Package-private (#11).
 */
@Service
class ClaimReleaseService implements ReleaseAbandonedBooking {

	private final Bookings bookings;
	private final AvailabilityClaim availability;

	ClaimReleaseService(Bookings bookings, AvailabilityClaim availability) {
		this.bookings = bookings;
		this.availability = availability;
	}

	@Override
	@Transactional
	public boolean release(BookingId bookingId) {
		return bookings.cancelAwaitingPayment(bookingId.value())
				.map(claim -> {
					for (var day : ServiceDays.between(claim.bookingDate(), claim.lastDate())) {
						availability.release(claim.setId(), day);
					}
					return true;
				})
				.orElse(false);
	}
}
