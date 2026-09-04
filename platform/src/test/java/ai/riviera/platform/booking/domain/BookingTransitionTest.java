package ai.riviera.platform.booking.domain;

import java.util.EnumSet;
import java.util.Set;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The transition table read as a table: what may follow each status, which statuses nothing leaves,
 * and the guest/admin asymmetry over {@code NO_SHOW}. Pure unit test — no Spring, no DB; that the
 * adapter's guarded {@code UPDATE}s agree with this is {@code JdbcBookingTransitionTableIT}'s job.
 */
class BookingTransitionTest {

	@Test
	void aRequestHasFourExits() {
		assertEquals(EnumSet.of(BookingStatus.AWAITING_PAYMENT, BookingStatus.DECLINED,
						BookingStatus.EXPIRED, BookingStatus.WITHDRAWN),
				BookingTransition.successorsOf(BookingStatus.PENDING_REQUEST),
				"accept, decline, expire, withdraw — one per party that can end a request");
	}

	@Test
	void anUnpaidBookingMayPayFailOrRevert() {
		assertEquals(EnumSet.of(BookingStatus.CONFIRMED, BookingStatus.CANCELLED,
						BookingStatus.PENDING_REQUEST),
				BookingTransition.successorsOf(BookingStatus.AWAITING_PAYMENT),
				"the revert is a real edge: a failed payment request puts an accepted request back");
	}

	@Test
	void aConfirmedBookingMayBeCancelledScannedOrSwept() {
		assertEquals(EnumSet.of(BookingStatus.CANCELLED, BookingStatus.COMPLETED, BookingStatus.NO_SHOW),
				BookingTransition.successorsOf(BookingStatus.CONFIRMED));
	}

	@Test
	void onlyTheWeatherRefundActsOnANoShow() {
		Set<BookingTransition> admittingNoShow = EnumSet.noneOf(BookingTransition.class);
		for (BookingTransition transition : BookingTransition.values()) {
			if (transition.admits(BookingStatus.NO_SHOW)) {
				admittingNoShow.add(transition);
			}
		}

		assertEquals(EnumSet.of(BookingTransition.WEATHER_REFUND), admittingNoShow,
				"a swept no-show is out of the guest's reach — only the admin refund still reaches it");
		assertEquals(EnumSet.of(BookingStatus.CONFIRMED),
				BookingTransition.CANCEL_BY_GUEST.admittedFrom(),
				"the guest's own cancel admits CONFIRMED and nothing else");
		assertEquals(EnumSet.of(BookingStatus.CANCELLED),
				BookingTransition.successorsOf(BookingStatus.NO_SHOW),
				"so NO_SHOW is terminal for the guest, not terminal outright");
	}

	@Test
	void fiveStatusesAreTerminal() {
		for (BookingStatus terminal : EnumSet.of(BookingStatus.CANCELLED, BookingStatus.COMPLETED,
				BookingStatus.DECLINED, BookingStatus.EXPIRED, BookingStatus.WITHDRAWN)) {
			assertTrue(BookingTransition.successorsOf(terminal).isEmpty(),
					terminal + " is terminal: nothing may follow it");
		}
	}

	@Test
	void everyStatusIsEitherBornOrReached() {
		Set<BookingStatus> reachable =
				EnumSet.of(BookingStatus.PENDING_REQUEST, BookingStatus.AWAITING_PAYMENT);
		for (BookingTransition transition : BookingTransition.values()) {
			reachable.add(transition.target());
		}

		assertEquals(EnumSet.allOf(BookingStatus.class), reachable,
				"a status the table cannot reach is either dead or a transition nobody wrote down");
	}
}
