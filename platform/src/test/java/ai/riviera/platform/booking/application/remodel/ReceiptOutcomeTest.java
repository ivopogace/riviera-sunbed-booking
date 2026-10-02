package ai.riviera.platform.booking.application.remodel;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.SpotRef;
import ai.riviera.platform.venue.vocabulary.SetId;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * The receipt line's own guard: a fee is a positive magnitude, only a refund bears one, and a nothing-left
 * line is zero. The same rules {@code remodel_receipt_outcome_fee_check} and {@code _nothing_left_check}
 * enforce in the table, held here so a caller building the record cannot write a row the database would refuse.
 */
class ReceiptOutcomeTest {

	private static final LocalDate DAY = LocalDate.of(2026, 7, 14);

	private static final SpotRef SPOT = new SpotRef(new SetId(12L), "A", 3);

	private static ReceiptOutcome outcome(ReceiptOutcomeKind kind, long feeMinor) {
		return new ReceiptOutcome(new BookingId(7L), DAY, SPOT, kind, 4500L, "EUR", feeMinor);
	}

	@Test
	void aRefundBearsTheFeeItWasCharged() {
		assertEquals(500L, outcome(ReceiptOutcomeKind.REFUND, 500L).feeMinor());
		assertDoesNotThrow(() -> outcome(ReceiptOutcomeKind.REFUND, 0L),
				"a refund charged nothing is a fee of zero, not an illegal line");
	}

	@Test
	void aReleaseOrADeclineBearsNoFee() {
		assertEquals(0L, outcome(ReceiptOutcomeKind.RELEASE, 0L).feeMinor());
		assertEquals(0L, outcome(ReceiptOutcomeKind.DECLINE, 0L).feeMinor());
		assertThrows(IllegalArgumentException.class, () -> outcome(ReceiptOutcomeKind.RELEASE, 500L),
				"nothing was collected, so nothing is reversed and nothing is charged");
		assertThrows(IllegalArgumentException.class, () -> outcome(ReceiptOutcomeKind.DECLINE, 500L));
	}

	@Test
	void aNothingLeftLineReturnsNothingAndBearsNoFee() {
		assertDoesNotThrow(() -> new ReceiptOutcome(new BookingId(7L), DAY, SPOT, ReceiptOutcomeKind.NOTHING_LEFT, 0L,
				"EUR", 0L));
		assertThrows(IllegalArgumentException.class, () -> outcome(ReceiptOutcomeKind.NOTHING_LEFT, 0L),
				"every day was refunded already, so the line's amount is zero (V75)");
		assertThrows(IllegalArgumentException.class, () -> new ReceiptOutcome(new BookingId(7L), DAY, SPOT,
				ReceiptOutcomeKind.NOTHING_LEFT, 0L, "EUR", 500L), "no refund, so no venue-change fee (V54)");
	}

	@Test
	void refusesANegativeFee() {
		assertThrows(IllegalArgumentException.class, () -> outcome(ReceiptOutcomeKind.REFUND, -1L),
				"a fee deducts because its ledger entry type is FEE, never because its amount is signed");
	}
}
