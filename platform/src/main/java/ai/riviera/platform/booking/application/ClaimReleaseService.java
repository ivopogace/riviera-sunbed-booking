package ai.riviera.platform.booking.application;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.booking.api.BookingId;
import ai.riviera.platform.booking.application.in.ReleaseAbandonedBooking;
import ai.riviera.platform.booking.application.out.Bookings;

/**
 * The one place an unpaid booking is cancelled and its set freed (issue #51), implementing
 * {@link ReleaseAbandonedBooking}. Both the {@code payment_intent.canceled} webhook listener and
 * the abandoned-payment TTL sweep delegate here, so there is a single guarded transition + release
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
					availability.release(claim.setId(), claim.bookingDate());
					return true;
				})
				.orElse(false);
	}
}
