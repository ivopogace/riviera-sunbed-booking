package ai.riviera.platform.payout;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.payout.domain.EntryType;
import ai.riviera.platform.payout.domain.PayoutLedgerEntry;
import ai.riviera.platform.venue.api.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Verifies the proportional reversal math (U6, ADR-0005 / invariants #5/#9): a REVERSAL mirrors the
 * accrual sized to the refund, with positive magnitudes and floor-rounded commission. Pure unit test.
 */
class ReversalMathTest {

	// Miramar-style accrual: gross 4500, 15% commission → commission 675, net 3825.
	private static final PayoutLedgerEntry ACCRUAL =
			PayoutLedgerEntry.accrual(new VenueId(1L), 42L, 4500L, 1500, "EUR");

	@Test
	void fullRefundReversesTheWholeAccrual() {
		PayoutLedgerEntry reversal = PayoutLedgerEntry.reversalOf(ACCRUAL, 4500L);

		assertEquals(EntryType.REVERSAL, reversal.entryType());
		assertEquals(4500L, reversal.grossMinor());
		assertEquals(675L, reversal.commissionMinor(), "full reversal mirrors the accrual commission");
		assertEquals(3825L, reversal.netMinor(), "full reversal nets out the accrual");
	}

	@Test
	void partialRefundReversesProportionally() {
		PayoutLedgerEntry reversal = PayoutLedgerEntry.reversalOf(ACCRUAL, 2250L); // 50%

		assertEquals(2250L, reversal.grossMinor());
		// floorDiv(675 × 2250, 4500) = floorDiv(1_518_750, 4500) = 337 (337.5 → 337, rounds down)
		assertEquals(337L, reversal.commissionMinor());
		assertEquals(1913L, reversal.netMinor(), "net = refund - proportional commission");
	}

	@Test
	void positiveMagnitudesSatisfyTheLedgerInvariant() {
		// net = gross - commission must hold (the canonical constructor enforces it, and the V9 CHECK).
		PayoutLedgerEntry reversal = PayoutLedgerEntry.reversalOf(ACCRUAL, 1L);
		assertEquals(reversal.grossMinor() - reversal.commissionMinor(), reversal.netMinor());
	}
}
