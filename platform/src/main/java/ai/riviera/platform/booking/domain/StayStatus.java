package ai.riviera.platform.booking.domain;

import java.util.Collection;

/**
 * The status a stay reads as, derived from its stretches' contract states (design D6): still owed
 * money while any stretch is, cancelled only when every stretch is, live while any stretch is, and
 * once every stretch has resolved, {@code COMPLETED} if any day was attended, else {@code NO_SHOW}.
 * A lifecycle rule, so it lives in {@code domain} (ADR-0018).
 */
public final class StayStatus {

	private StayStatus() {
	}

	public static BookingStatus of(Collection<BookingStatus> stretches) {
		if (stretches.isEmpty()) {
			throw new IllegalArgumentException("a stay has at least one stretch");
		}
		if (stretches.contains(BookingStatus.AWAITING_PAYMENT)) {
			return BookingStatus.AWAITING_PAYMENT;
		}
		if (stretches.stream().allMatch(status -> status == BookingStatus.CANCELLED)) {
			return BookingStatus.CANCELLED;
		}
		if (stretches.contains(BookingStatus.CONFIRMED)) {
			return BookingStatus.CONFIRMED;
		}
		return stretches.contains(BookingStatus.COMPLETED) ? BookingStatus.COMPLETED : BookingStatus.NO_SHOW;
	}
}
