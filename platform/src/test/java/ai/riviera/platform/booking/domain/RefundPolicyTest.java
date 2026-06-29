package ai.riviera.platform.booking.domain;

import org.junit.jupiter.api.Test;

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
		assertEquals(4500L, RefundPolicy.refundMinor(4500L, true, 0));
		assertEquals(4500L, RefundPolicy.refundMinor(4500L, true, 5000));
	}

	@Test
	void configurableShareAfterCutoff() {
		assertEquals(2250L, RefundPolicy.refundMinor(4500L, false, 5000)); // 50%
		assertEquals(0L, RefundPolicy.refundMinor(4500L, false, 0));        // non-refundable
		assertEquals(4500L, RefundPolicy.refundMinor(4500L, false, 10000)); // full late refund
	}

	@Test
	void afterCutoffRoundsDown() {
		// 4505 × 50% = 2252.5 → 2252 (floorDiv); the platform keeps the half-cent (invariant #5).
		assertEquals(2252L, RefundPolicy.refundMinor(4505L, false, 5000));
	}
}
