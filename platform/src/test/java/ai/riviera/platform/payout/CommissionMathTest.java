package ai.riviera.platform.payout;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.payout.domain.EntryType;
import ai.riviera.platform.payout.domain.PayoutLedgerEntry;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * AC-4 (issue #9): the commission/net arithmetic is exact integer minor units, rounded down
 * (invariant #5) — pure, no Spring/DB. {@code commission = floorDiv(gross × bps, 10000)};
 * {@code net = gross − commission}; the venue keeps the sub-cent remainder.
 */
class CommissionMathTest {

	private static final VenueId VENUE = new VenueId(1);

	private static PayoutLedgerEntry accrual(long gross, int bps) {
		return PayoutLedgerEntry.accrual(VENUE, 42L, gross, bps, "EUR");
	}

	@Test
	void computesCommissionAndNetForTypicalRate() {
		PayoutLedgerEntry e = accrual(4500L, 1500); // €45.00 at 15.00%
		assertEquals(EntryType.ACCRUAL, e.entryType());
		assertEquals(675L, e.commissionMinor(), "15% of 4500 = 675");
		assertEquals(3825L, e.netMinor(), "net = 4500 - 675");
	}

	@Test
	void roundsCommissionDown() {
		// 333 × 1500 / 10000 = 49.95 → floor 49; the venue keeps the remainder.
		PayoutLedgerEntry e = accrual(333L, 1500);
		assertEquals(49L, e.commissionMinor(), "floorDiv truncates 49.95 -> 49");
		assertEquals(284L, e.netMinor(), "net = 333 - 49");
	}

	@Test
	void zeroCommissionRateKeepsWholeGross() {
		PayoutLedgerEntry e = accrual(4500L, 0);
		assertEquals(0L, e.commissionMinor());
		assertEquals(4500L, e.netMinor(), "0 bps -> venue keeps the full amount");
	}

	@Test
	void fullCommissionRateLeavesZeroNet() {
		PayoutLedgerEntry e = accrual(4500L, 10_000); // 100.00%
		assertEquals(4500L, e.commissionMinor());
		assertEquals(0L, e.netMinor());
	}

	@Test
	void zeroGrossIsZeroEverywhere() {
		PayoutLedgerEntry e = accrual(0L, 1500);
		assertEquals(0L, e.commissionMinor());
		assertEquals(0L, e.netMinor());
	}

	@Test
	void rejectsBlankCurrency() {
		assertThrows(IllegalArgumentException.class,
				() -> PayoutLedgerEntry.accrual(VENUE, 1L, 100L, 1500, " "));
	}
}
