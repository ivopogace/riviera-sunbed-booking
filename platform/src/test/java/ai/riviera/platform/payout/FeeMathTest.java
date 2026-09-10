package ai.riviera.platform.payout;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.payout.domain.EntryType;
import ai.riviera.platform.payout.domain.PayoutLedgerEntry;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Verifies the venue-change fee entry (invariants #5/#9): a {@code FEE} has no gross and no
 * commission, its whole amount is the net the venue is charged, and it is stored as a positive
 * magnitude — direction lives in {@link EntryType#FEE}. Pure unit test.
 */
class FeeMathTest {

	private static final VenueId VENUE = new VenueId(1L);

	@Test
	void aFeeCarriesNoGrossAndNoCommission() {
		PayoutLedgerEntry fee = PayoutLedgerEntry.fee(VENUE, 42L, 500L, "EUR");

		assertEquals(EntryType.FEE, fee.entryType());
		assertEquals(0L, fee.grossMinor(), "a fee is charged against no booking amount");
		assertEquals(0L, fee.commissionMinor(), "the platform takes no commission on its own fee");
		assertEquals(500L, fee.netMinor(), "the whole fee is what the venue is charged");
		assertEquals("EUR", fee.currency());
	}

	@Test
	void aFeeRecordsWhyItWasCharged() {
		assertEquals(RefundReason.VENUE_CHANGE, PayoutLedgerEntry.fee(VENUE, 42L, 500L, "EUR").reason(),
				"the ledger stays auditable: a fee names the reason that earned it");
	}

	@Test
	void aFeeIsStoredAsAPositiveMagnitude() {
		assertThrows(IllegalArgumentException.class, () -> PayoutLedgerEntry.fee(VENUE, 42L, -500L, "EUR"),
				"a negative fee would put the direction in the amount instead of the entry type");
	}

	@Test
	void everyOtherEntryTypeStillHoldsNetEqualsGrossMinusCommission() {
		assertThrows(IllegalArgumentException.class,
				() -> new PayoutLedgerEntry(VENUE, 42L, EntryType.ACCRUAL, 0L, 0L, 500L, "EUR", null),
				"the FEE exemption is keyed on the entry type alone.");
	}
}
