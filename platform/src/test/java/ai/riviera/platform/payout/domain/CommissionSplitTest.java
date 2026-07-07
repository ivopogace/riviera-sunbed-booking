package ai.riviera.platform.payout.domain;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * The single commission formula (#171): {@code commission = floorDiv(gross × bps, 10000)}, net =
 * gross − commission, integer-exact and rounded down (invariant #5). Shared by the ledger accrual
 * and the console daily-takings read.
 */
class CommissionSplitTest {

	@Test
	void splitsWithFloorDiv() {
		CommissionSplit split = CommissionSplit.of(11000, 1500); // 11000 * 1500 / 10000 = 1650

		assertEquals(11000, split.grossMinor());
		assertEquals(1650, split.commissionMinor());
		assertEquals(9350, split.netMinor());
	}

	@Test
	void roundsCommissionDownLeavingTheRemainderWithTheVenue() {
		// 333 * 1500 = 499_500; / 10000 = 49.95 -> floor 49; net keeps the sub-cent remainder.
		CommissionSplit split = CommissionSplit.of(333, 1500);

		assertEquals(49, split.commissionMinor());
		assertEquals(284, split.netMinor());
	}

	@Test
	void zeroGrossIsAllZero() {
		CommissionSplit split = CommissionSplit.of(0, 1500);

		assertEquals(0, split.grossMinor());
		assertEquals(0, split.commissionMinor());
		assertEquals(0, split.netMinor());
	}
}
