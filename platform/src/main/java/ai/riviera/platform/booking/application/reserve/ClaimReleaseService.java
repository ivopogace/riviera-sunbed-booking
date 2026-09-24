package ai.riviera.platform.booking.application.reserve;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.application.refund.ReleaseAbandonedBooking;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.domain.ServiceDays;

/**
 * The one place an unpaid booking is cancelled and its set freed, implementing
 * {@link ReleaseAbandonedBooking} — every day of its span. Both the {@code payment_intent.canceled}
 * webhook listener and the abandoned-payment TTL sweep delegate here, so there is a single guarded
 * transition + release
 * — no forked copy that could drift or double-act.
 *
 * <p>{@code @Transactional}: the guarded {@code cancelAwaitingPayment} ({@code UPDATE … RETURNING})
 * and the {@code availability.release} commit together, so a booking is never left
 * {@code CANCELLED} with its set still claimed (invariant #2). The {@code RETURNING} clause makes a
 * lost race / re-delivery a 0-row no-op, so {@code release} releases the set exactly once.
 * Package-private; only the {@code application.in} port is referenced by the driving adapters
 * (invariant #11).
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
