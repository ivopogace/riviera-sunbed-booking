package ai.riviera.platform.booking.domain;

import java.util.List;

import org.junit.jupiter.api.Test;

import static ai.riviera.platform.booking.domain.BookingStatus.AWAITING_PAYMENT;
import static ai.riviera.platform.booking.domain.BookingStatus.CANCELLED;
import static ai.riviera.platform.booking.domain.BookingStatus.COMPLETED;
import static ai.riviera.platform.booking.domain.BookingStatus.CONFIRMED;
import static ai.riviera.platform.booking.domain.BookingStatus.NO_SHOW;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/** A stay's status is derived from its stretches: owed while any is owed, live while any is live, cancelled only whole. */
class StayStatusTest {

	@Test
	void awaitingPaymentWhileAnyStretchIs() {
		assertEquals(AWAITING_PAYMENT, StayStatus.of(List.of(CONFIRMED, AWAITING_PAYMENT)));
	}

	@Test
	void confirmedWhileAnyStretchIsLive() {
		assertEquals(CONFIRMED, StayStatus.of(List.of(COMPLETED, CONFIRMED)));
		assertEquals(CONFIRMED, StayStatus.of(List.of(CANCELLED, CONFIRMED)));
	}

	@Test
	void cancelledOnlyWhenEveryStretchIs() {
		assertEquals(CANCELLED, StayStatus.of(List.of(CANCELLED, CANCELLED)));
	}

	@Test
	void resolvedStaysReadCompletedIfAnyDayWasAttendedElseNoShow() {
		assertEquals(COMPLETED, StayStatus.of(List.of(NO_SHOW, COMPLETED)));
		assertEquals(NO_SHOW, StayStatus.of(List.of(NO_SHOW, NO_SHOW)));
		assertEquals(COMPLETED, StayStatus.of(List.of(CANCELLED, COMPLETED)));
	}

	@Test
	void anEmptyStayIsABug() {
		assertThrows(IllegalArgumentException.class, () -> StayStatus.of(List.of()));
	}
}
