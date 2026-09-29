package ai.riviera.platform.payout;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.payout.domain.EntryType;
import ai.riviera.platform.payout.domain.PayoutLedgerEntry;
import ai.riviera.platform.payout.domain.Reversed;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Verifies the proportional reversal math (U6, ADR-0005 / invariants #5/#9): a REVERSAL mirrors the
 * accrual sized to the refund, with positive magnitudes and floor-rounded commission; a DAY_REVERSAL
 * (issue #1210) the same, keyed by its day; and the reversal that exhausts the accrual returns the
 * commission still held so the parts net exactly zero. Pure unit test.
 */
class ReversalMathTest {

	// Miramar-style accrual: gross 4500, 15% commission → commission 675, net 3825.
	private static final PayoutLedgerEntry ACCRUAL =
			PayoutLedgerEntry.accrual(new VenueId(1L), 42L, 4500L, 1500, "EUR");

	@Test
	void fullRefundReversesTheWholeAccrual() {
		PayoutLedgerEntry reversal = PayoutLedgerEntry.reversalOf(ACCRUAL, 4500L, RefundReason.POLICY);

		assertEquals(EntryType.REVERSAL, reversal.entryType());
		assertEquals(4500L, reversal.grossMinor());
		assertEquals(675L, reversal.commissionMinor(), "full reversal mirrors the accrual commission");
		assertEquals(3825L, reversal.netMinor(), "full reversal nets out the accrual");
		assertEquals(RefundReason.POLICY, reversal.reason(), "the reversal records the refund reason");
	}

	@Test
	void partialRefundReversesProportionally() {
		PayoutLedgerEntry reversal =
				PayoutLedgerEntry.reversalOf(ACCRUAL, 2250L, RefundReason.WEATHER); // 50%

		assertEquals(2250L, reversal.grossMinor());
		// floorDiv(675 × 2250, 4500) = floorDiv(1_518_750, 4500) = 337 (337.5 → 337, rounds down)
		assertEquals(337L, reversal.commissionMinor());
		assertEquals(1913L, reversal.netMinor(), "net = refund - proportional commission");
	}

	@Test
	void positiveMagnitudesSatisfyTheLedgerInvariant() {
		// net = gross - commission must hold (the canonical constructor enforces it, and the V9 CHECK).
		PayoutLedgerEntry reversal = PayoutLedgerEntry.reversalOf(ACCRUAL, 1L, RefundReason.POLICY);
		assertEquals(reversal.grossMinor() - reversal.commissionMinor(), reversal.netMinor());
	}

	@Test
	void aDayReversalIsKeyedByItsDayAndProRata() {
		// A 14-day booking at 3000/day, 15%: gross 42000, commission 6300; day 8 refunds 3000.
		PayoutLedgerEntry accrual = PayoutLedgerEntry.accrual(new VenueId(1L), 43L, 42000L, 1500, "EUR");
		LocalDate day = LocalDate.of(2026, 7, 8);

		PayoutLedgerEntry reversal = PayoutLedgerEntry.dayReversalOf(accrual, day, 3000L, Reversed.NONE,
				RefundReason.WEATHER);

		assertEquals(EntryType.DAY_REVERSAL, reversal.entryType());
		assertEquals(day, reversal.serviceDate(), "the day is the row's key");
		assertEquals(3000L, reversal.grossMinor());
		assertEquals(450L, reversal.commissionMinor(), "floorDiv(6300 × 3000, 42000) = 450");
		assertEquals(2550L, reversal.netMinor());
		assertEquals(RefundReason.WEATHER, reversal.reason(), "the reason is the event's");
	}

	@Test
	void theReversalThatExhaustsTheAccrualReturnsTheCommissionStillHeld() {
		// gross 1000, 15% → commission 150. Three days at 333 each: 49 + 49 pro rata, then the last must
		// return 52, not floor(150 × 334 / 1000) = 50, so the three reverse exactly 150.
		PayoutLedgerEntry accrual = PayoutLedgerEntry.accrual(new VenueId(1L), 44L, 1000L, 1500, "EUR");
		PayoutLedgerEntry first = PayoutLedgerEntry.dayReversalOf(accrual, LocalDate.of(2026, 7, 1), 333L,
				Reversed.NONE, RefundReason.WEATHER);
		PayoutLedgerEntry second = PayoutLedgerEntry.dayReversalOf(accrual, LocalDate.of(2026, 7, 2), 333L,
				new Reversed(first.grossMinor(), first.commissionMinor()), RefundReason.VENUE);
		PayoutLedgerEntry last = PayoutLedgerEntry.reversalOf(accrual, 334L, RefundReason.POLICY,
				new Reversed(666L, first.commissionMinor() + second.commissionMinor()));

		assertEquals(49L, first.commissionMinor());
		assertEquals(49L, second.commissionMinor());
		assertEquals(52L, last.commissionMinor(), "the exhausting reversal takes what is left");
		assertEquals(150L, first.commissionMinor() + second.commissionMinor() + last.commissionMinor());
		assertEquals(accrual.netMinor(), first.netMinor() + second.netMinor() + last.netMinor(),
				"reversed in parts, the booking nets exactly zero (invariant #9)");
	}

	@Test
	void aPartialReversalAfterEarlierOnesStaysProRata() {
		PayoutLedgerEntry reversal = PayoutLedgerEntry.reversalOf(ACCRUAL, 2250L, RefundReason.POLICY,
				new Reversed(1000L, 150L));

		assertEquals(337L, reversal.commissionMinor(), "not yet exhausted: floorDiv(675 × 2250, 4500)");
	}

	@Test
	void aDatelessTypeRefusesADayAndADayReversalRequiresOne() {
		assertThrows(IllegalArgumentException.class, () -> new PayoutLedgerEntry(new VenueId(1L), 45L,
				EntryType.REVERSAL, 100L, 15L, 85L, "EUR", RefundReason.POLICY, LocalDate.of(2026, 7, 1)));
		assertThrows(IllegalArgumentException.class, () -> new PayoutLedgerEntry(new VenueId(1L), 45L,
				EntryType.DAY_REVERSAL, 100L, 15L, 85L, "EUR", RefundReason.WEATHER, null));
	}
}
