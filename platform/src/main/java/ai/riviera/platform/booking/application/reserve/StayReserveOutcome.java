package ai.riviera.platform.booking.application.reserve;

import java.time.LocalDate;
import java.util.List;

import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;

/**
 * The committed reserve phase of a stay: every stretch claimed and inserted {@code AWAITING_PAYMENT}
 * under one stay row, or a refusal that touched no claim. {@link CreateStayService} collects after
 * the commit, so no row lock spans the gateway call (RESPONSIBILITIES.md §booking).
 */
sealed interface StayReserveOutcome {

	record Reserved(StayId stayId, String code, SetBookingInfo venue, CustomerId customerId,
			List<ReservedStretch> stretches) implements StayReserveOutcome {

		long totalMinor() {
			return stretches.stream().mapToLong(ReservedStretch::amountMinor).reduce(0L, Math::addExact);
		}
	}

	/** One stretch's booking as inserted: its id, its set and the money it owes (invariant #5). */
	record ReservedStretch(long bookingId, SetBookingInfo set, LocalDate firstDay, LocalDate lastDay,
			long amountMinor) {
	}

	record Rejected(BookingOutcome.Rejected reason) implements StayReserveOutcome {
	}
}
