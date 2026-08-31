package ai.riviera.platform.booking.domain;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.booking.vocabulary.CancellationWindow;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Verifies the server-side refund math (U6, invariant #10/#5): full before the cutoff; the venue's
 * configurable share after, rounded <strong>down</strong> (the platform keeps the sub-cent). Pure
 * unit test — no Spring, no DB.
 */
class RefundPolicyTest {

	@Test
	void fullRefundBeforeCutoff() {
		// Before the cutoff the late-cancel bps is irrelevant — always the full gross.
		assertEquals(4500L, RefundPolicy.refundMinor(4500L, CancellationWindow.FREE, 0));
		assertEquals(4500L, RefundPolicy.refundMinor(4500L, CancellationWindow.FREE, 5000));
	}

	@Test
	void configurableShareAfterCutoff() {
		assertEquals(2250L, RefundPolicy.refundMinor(4500L, CancellationWindow.LATE, 5000)); // 50%
		assertEquals(0L, RefundPolicy.refundMinor(4500L, CancellationWindow.LATE, 0));       // none
		assertEquals(4500L, RefundPolicy.refundMinor(4500L, CancellationWindow.LATE, 10000)); // full
	}

	@Test
	void afterCutoffRoundsDown() {
		// 4505 × 50% = 2252.5 → 2252 (floorDiv); the platform keeps the half-cent (invariant #5).
		assertEquals(2252L, RefundPolicy.refundMinor(4505L, CancellationWindow.LATE, 5000));
	}

	@Test
	void closedWindowRefundsNothing() {
		// The stay is consumable, so no share of it is reclaimable at any venue's bps setting.
		assertEquals(0L, RefundPolicy.refundMinor(4500L, CancellationWindow.CLOSED, 5000));
		assertEquals(0L, RefundPolicy.refundMinor(4500L, CancellationWindow.CLOSED, 10000));
	}
}
